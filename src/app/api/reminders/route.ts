import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getReminders, createReminder, resolveNextDate } from "@/lib/reminders";
import { todayStrJST } from "@/lib/date";

export async function GET() {
  try {
    await requireOwnerSession();
    const rows = await getReminders();
    const today = todayStrJST();
    const reminders = rows
      .map((r) => {
        const { next_date, done_today } = resolveNextDate(r, today);
        return {
          id: r.id,
          name: r.name,
          recurrence_type: r.recurrence_type,
          day_of_week: r.day_of_week,
          day_of_month: r.day_of_month,
          memo: r.memo,
          active: r.active,
          next_date,
          done_today,
          last_completed_date: r.last_completed_date,
          notify_time: r.notify_time,
          created_at: r.created_at,
        };
      })
      .sort((a, b) => (a.active === b.active ? a.next_date.localeCompare(b.next_date) : a.active ? -1 : 1));
    return NextResponse.json({ reminders });
  } catch (e) {
    return errorResponse(e);
  }
}

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

const bodySchema = z.object({
  name: z.string().min(1).max(60),
  recurrence_type: z.enum(["daily", "weekly", "monthly"]),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  memo: z.string().max(300).optional(),
  notify_time: z.string().regex(TIME_RE).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const reminder = await createReminder(input);
    return NextResponse.json({ reminder });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
