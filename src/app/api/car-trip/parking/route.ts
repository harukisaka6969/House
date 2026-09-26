import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { researchParkingOptions } from "@/lib/anthropic";
import { isValidDateStr } from "@/lib/date";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  destination: z.string().trim().min(1).max(200),
  date: z.string(),
  start_time: z.string().regex(TIME_RE),
  end_time: z.string().regex(TIME_RE),
  /** quick=Web検索なしの即答（数秒）、detailed=Web検索ありの確認済み結果（遅い）。 */
  mode: z.enum(["quick", "detailed"]).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const { destination, date, start_time, end_time, mode } = bodySchema.parse(await req.json());
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");

    const result = await researchParkingOptions({
      destination,
      date,
      startTime: start_time,
      endTime: end_time,
      mode: mode ?? "detailed",
    });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
