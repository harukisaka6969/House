import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getRehabLogsInRange, createRehabLog } from "@/lib/rehabLog";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { monthRange } from "@/lib/expenses";
import type { RehabLogKind } from "@/lib/types";

const KINDS: RehabLogKind[] = ["impulse", "dignity", "reframe", "love_check"];

function assertHaruki(slug: string) {
  if (slug !== "haruki") throw new ApiError(403, "この機能は利用できません。");
}

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    assertHaruki(session.slug);
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("month") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    const { from, toExclusive } = monthRange(m);
    const logs = await getRehabLogsInRange(session.profile_id, from, toExclusive);
    return NextResponse.json({ logs });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  date: z.string(),
  kind: z.enum(["impulse", "dignity", "reframe", "love_check"]),
  data: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    assertHaruki(session.slug);
    const { date, kind, data } = bodySchema.parse(await req.json());
    if (!KINDS.includes(kind)) throw new ApiError(400, "invalid kind");
    const log = await createRehabLog(session.profile_id, date, kind, data);
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
