import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { listPeopleWithLastEncounter, createPerson, DuplicateAliasError } from "@/lib/people";
import type { PersonOut } from "@/lib/apiTypes";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const rows = await listPeopleWithLastEncounter(session.profile_id);
    const people: PersonOut[] = rows.map((r) => ({
      id: r.id,
      canonical_name: r.canonical_name,
      reading: r.reading,
      memo: r.memo,
      aliases: r.aliases,
      last_date: r.last_date,
      last_summary: r.last_summary,
      encounter_count: r.encounter_count,
    }));
    return NextResponse.json({ people });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  canonical_name: z.string().min(1).max(100),
  reading: z.string().max(100).optional(),
  aliases: z.array(z.string().min(1).max(100)).max(20).optional(),
});

/** 新しい人物を手動登録する（表記ゆれ登録フォーム）。既にvCard等で入っている場合は登録済み人物への
 * エイリアス追加（/api/people/[id]/aliases）を使うこと。 */
export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const body = bodySchema.parse(await req.json());
    const { person, failedAliases } = await createPerson({ canonicalName: body.canonical_name, reading: body.reading, aliases: body.aliases });
    const out: PersonOut = {
      id: person.id,
      canonical_name: person.canonical_name,
      reading: person.reading,
      memo: person.memo,
      aliases: person.aliases,
      last_date: null,
      last_summary: null,
      encounter_count: 0,
    };
    return NextResponse.json({ person: out, failedAliases });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    if (e instanceof DuplicateAliasError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
