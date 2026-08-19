import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { extractJournalEncounters } from "@/lib/anthropic";
import { listPeopleWithAliases, replaceJournalEncounters } from "@/lib/people";
import { db } from "@/lib/db";
import { isValidDateStr } from "@/lib/date";
import type { JournalEncounterOut } from "@/lib/apiTypes";
import type { JournalEncounterRow } from "@/lib/types";

const bodySchema = z.object({ text: z.string().max(5000) });
const AI_ERROR_MESSAGE = "AIによる抽出に失敗しました。時間をおいてもう一度お試しください。";

/** その日、既にAI抽出済みの出会い記録をそのまま返す（AIは呼ばない。日付を切り替えたときの表示用）。 */
export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const { data, error } = await db().from("journal_encounters").select("*").eq("owner", session.profile_id).eq("date", date);
    if (error) throw error;
    const rows = (data ?? []) as JournalEncounterRow[];
    const people = rows.some((r) => r.person_id) ? await listPeopleWithAliases() : [];
    const nameById = new Map(people.map((p) => [p.id, p.canonical_name]));
    const encounters: JournalEncounterOut[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      person_id: r.person_id,
      person_raw_name: r.person_id ? nameById.get(r.person_id) ?? r.person_raw_name : r.person_raw_name,
      summary: r.summary,
    }));
    return NextResponse.json({ encounters });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 日記本文から「その日、誰と会って何をしたか」をAIで抽出し、その日(自分の日記)の出会い記録を
 * 置き換える（押すたびに冪等）。表記が人物台帳のエイリアスと一致すればperson_idを埋め、
 * 一致しなければperson_raw_nameだけの未登録として残す（あとで人物登録すれば再抽出で紐づく）。 */
export async function POST(req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const { text } = bodySchema.parse(await req.json());

    if (!text.trim()) {
      await replaceJournalEncounters(session.profile_id, date, []);
      return NextResponse.json({ encounters: [] satisfies JournalEncounterOut[] });
    }

    const people = await listPeopleWithAliases();
    const aliasToPersonId = new Map<string, string>();
    const nameById = new Map<string, string>();
    const knownNames: string[] = [];
    for (const p of people) {
      knownNames.push(p.canonical_name);
      nameById.set(p.id, p.canonical_name);
      aliasToPersonId.set(p.canonical_name.toLowerCase(), p.id);
      for (const a of p.aliases) aliasToPersonId.set(a.alias.toLowerCase(), p.id);
    }

    let extracted;
    try {
      extracted = await extractJournalEncounters(text, knownNames);
    } catch (err) {
      console.error("extractJournalEncounters failed", err);
      throw new ApiError(502, `${AI_ERROR_MESSAGE}（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    const prepared = extracted.map((e) => ({
      personId: aliasToPersonId.get(e.person.toLowerCase()) ?? null,
      personRawName: e.person,
      summary: e.summary,
    }));

    const rows = await replaceJournalEncounters(session.profile_id, date, prepared);
    const out: JournalEncounterOut[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      person_id: r.person_id,
      person_raw_name: r.person_id ? nameById.get(r.person_id) ?? r.person_raw_name : r.person_raw_name,
      summary: r.summary,
    }));
    return NextResponse.json({ encounters: out });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
