import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { runSmartHomeTextCommand } from "@/lib/switchbotCommand";

const bodySchema = z.object({ text: z.string().min(1).max(200) });

/** アプリ内の「テキストで操作する」ボックス用。LINEの家電操作と同じ処理を共有している。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const { text } = bodySchema.parse(await req.json());
    const message = await runSmartHomeTextCommand(text);
    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
