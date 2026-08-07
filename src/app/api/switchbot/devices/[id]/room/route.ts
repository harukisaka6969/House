import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setDeviceRoom } from "@/lib/switchbotRooms";

const bodySchema = z.object({ room: z.string().max(30).nullable() });

/** デバイスを部屋に割り当てる（roomを空文字/nullにすると割り当て解除）。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { room } = bodySchema.parse(await req.json());
    await setDeviceRoom(id, room);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
