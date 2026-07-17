import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { suggestCategory } from "@/lib/anthropic";

const bodySchema = z.object({
  text: z.string().min(1).max(300),
  options: z.array(z.string()).max(50).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai-suggest:${session.profile_id}:${clientIp(req)}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const { text, options } = bodySchema.parse(await req.json());
    const category = await suggestCategory(text, options ?? null);
    return NextResponse.json({ category });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
