import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { switchBotAvailable, sendCommand } from "@/lib/switchbot";

const bodySchema = z.object({
  command: z.string().min(1).max(60),
  parameter: z.string().max(200).optional(),
  commandType: z.string().max(30).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    if (!switchBotAvailable()) throw new ApiError(400, "SwitchBot連携が未設定です。");

    const limited = rateLimit(`switchbot:${session.profile_id}`, 60, 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "操作が多すぎます。しばらくしてから再試行してください。");

    const { id } = await ctx.params;
    const { command, parameter, commandType } = bodySchema.parse(await req.json());
    await sendCommand(id, command, parameter ?? "default", commandType ?? "command");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
