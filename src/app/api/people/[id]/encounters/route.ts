import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getEncountersForPerson } from "@/lib/people";
import type { JournalEncounterOut } from "@/lib/apiTypes";

/** 自分がこの人物と会った記録を新しい順に返す（自分の日記由来のみ。日記は本人にしか見えないため）。 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const rows = await getEncountersForPerson(session.profile_id, id);
    const encounters: JournalEncounterOut[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      person_id: r.person_id,
      person_raw_name: r.person_raw_name,
      summary: r.summary,
    }));
    return NextResponse.json({ encounters });
  } catch (e) {
    return errorResponse(e);
  }
}
