import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setLineReminderTime } from "@/lib/profiles";

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

const bodySchema = z.object({ time: z.string().nullable() });

/** 本人のリマインダー配信時刻（JST "HH:MM"、15分刻み）を設定・解除する（nullで配信オフ）。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { time } = bodySchema.parse(await req.json());

    if (time !== null && !TIME_RE.test(time)) {
      return NextResponse.json({ error: "時刻は15分刻み（00・15・30・45分）で指定してください。" }, { status: 400 });
    }

    await setLineReminderTime(session.profile_id, time);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
