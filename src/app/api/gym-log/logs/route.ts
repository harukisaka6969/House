import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { createLog } from "@/lib/gymLog";
import { getSportLogsInRange, createSportLog } from "@/lib/journal";
import { isValidDateStr, nextDayStr } from "@/lib/date";

const setSchema = z.object({ weight: z.number().min(0), reps: z.number().int().min(0) });
const bodySchema = z.object({
  exercise_id: z.string(),
  date: z.string(),
  sets: z.array(setSchema).max(20).optional(),
  duration_minutes: z.number().min(0).max(1000).nullable().optional(),
  distance_km: z.number().min(0).max(500).nullable().optional(),
  note: z.string().max(500).optional(),
  splitLabel: z.string().max(60).optional(),
});

/** 種目の記録を保存し、その日にまだ「ジム」を含むスポーツ記録がなければ自動で1件作成する（日記のカレンダーの青丸と連動）。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { exercise_id, date, sets, duration_minutes, distance_km, note, splitLabel } = bodySchema.parse(await req.json());
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");

    const log = await createLog(session.profile_id, exercise_id, date, {
      sets: sets ?? [],
      durationMinutes: duration_minutes ?? null,
      distanceKm: distance_km ?? null,
      note: note ?? "",
    });

    const existingSportLogs = await getSportLogsInRange(date, nextDayStr(date));
    const hasGymLog = existingSportLogs.some((l) => l.owner === session.profile_id && l.activity.includes("ジム"));
    if (!hasGymLog) {
      await createSportLog(session.profile_id, {
        date,
        activity: splitLabel ? `ジム（${splitLabel}）` : "ジム",
      });
    }

    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
