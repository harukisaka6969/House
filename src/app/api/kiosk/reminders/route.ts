import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKioskOrOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createReminder } from "@/lib/reminders";

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const NIGHT_TIME_RE = /^0[0-5]:/;

const bodySchema = z
  .object({
    name: z.string().min(1).max(60),
    recurrence_type: z.enum(["daily", "weekly", "monthly"]),
    day_of_week: z.number().int().min(0).max(6).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
    memo: z.string().max(300).optional(),
    notify_time: z.string().regex(TIME_RE).nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine((data) => !(data.recurrence_type === "daily" && data.notify_time && NIGHT_TIME_RE.test(data.notify_time)), {
    message: "「毎日」のリマインダーは深夜（0〜5時）に通知できません。",
    path: ["notify_time"],
  });

/** 常設ダッシュボード（kioskロール含む）から、やることを直接登録できるようにする専用エンドポイント。
 * 他のAPIには一切触れないkioskロールの原則を守るため、/api/kiosk配下に置く。 */
export async function POST(req: Request) {
  try {
    await requireKioskOrOwnerSession();
    const input = bodySchema.parse(await req.json());
    const reminder = await createReminder(input);
    return NextResponse.json({ reminder });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
