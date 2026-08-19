import "server-only";
import { randomUUID } from "crypto";
import { db } from "./db";
import type { PersonRow, PersonAliasRow, JournalEncounterRow } from "./types";

export class DuplicateAliasError extends Error {}

export interface AliasRef {
  id: string;
  alias: string;
}

export interface PersonWithAliases extends PersonRow {
  /** canonical_name自身は含まない、それ以外の表記ゆれ一覧。 */
  aliases: AliasRef[];
}

async function fetchPeopleAndAliases(): Promise<{ people: PersonRow[]; aliases: PersonAliasRow[] }> {
  const [peopleRes, aliasesRes] = await Promise.all([
    db().from("people").select("*").order("canonical_name", { ascending: true }),
    db().from("person_aliases").select("*"),
  ]);
  if (peopleRes.error) throw peopleRes.error;
  if (aliasesRes.error) throw aliasesRes.error;
  return { people: (peopleRes.data ?? []) as PersonRow[], aliases: (aliasesRes.data ?? []) as PersonAliasRow[] };
}

function attachAliases(people: PersonRow[], aliases: PersonAliasRow[]): PersonWithAliases[] {
  const byPerson = new Map<string, AliasRef[]>();
  for (const a of aliases) {
    const arr = byPerson.get(a.person_id) ?? [];
    arr.push({ id: a.id, alias: a.alias });
    byPerson.set(a.person_id, arr);
  }
  return people.map((p) => ({
    ...p,
    aliases: (byPerson.get(p.id) ?? []).filter((a) => a.alias.toLowerCase() !== p.canonical_name.toLowerCase()),
  }));
}

/** 世帯で共有する人物台帳の全件（表記ゆれ付き）。日記抽出時の名寄せの元データにする。 */
export async function listPeopleWithAliases(): Promise<PersonWithAliases[]> {
  const { people, aliases } = await fetchPeopleAndAliases();
  return attachAliases(people, aliases);
}

/** 人物台帳に、自分（ownerId）の日記から集計した「最後に会った日・要約・回数」を付けて返す。
 * 日記は本人にしか見えないため、この集計も必ずownerでスコープする。 */
export async function listPeopleWithLastEncounter(
  ownerId: string
): Promise<(PersonWithAliases & { last_date: string | null; last_summary: string | null; encounter_count: number })[]> {
  const [{ people, aliases }, encRes] = await Promise.all([
    fetchPeopleAndAliases(),
    db().from("journal_encounters").select("*").eq("owner", ownerId).order("date", { ascending: false }),
  ]);
  if (encRes.error) throw encRes.error;
  const encounters = (encRes.data ?? []) as JournalEncounterRow[];
  const byPerson = new Map<string, JournalEncounterRow[]>();
  for (const e of encounters) {
    if (!e.person_id) continue;
    const arr = byPerson.get(e.person_id) ?? [];
    arr.push(e);
    byPerson.set(e.person_id, arr);
  }
  return attachAliases(people, aliases).map((p) => {
    const list = byPerson.get(p.id) ?? []; // 既にdate降順
    const last = list[0];
    return { ...p, last_date: last?.date ?? null, last_summary: last?.summary ?? null, encounter_count: list.length };
  });
}

/** 自分（ownerId）がその人物と会った記録を新しい順に。 */
export async function getEncountersForPerson(ownerId: string, personId: string): Promise<JournalEncounterRow[]> {
  const { data, error } = await db().from("journal_encounters").select("*").eq("owner", ownerId).eq("person_id", personId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as JournalEncounterRow[];
}

/** 新しい人物を登録する。canonical_name自身も必ず1件、表記ゆれとして一緒に登録する
 * （日記抽出時の名寄せは常にperson_aliasesの引き当てだけで完結させるため）。
 * 指定したエイリアスの一部が既に別人に登録済みの場合はそれだけスキップし、failedAliasesで報告する。 */
export async function createPerson(
  input: { canonicalName: string; reading?: string; aliases?: string[] }
): Promise<{ person: PersonWithAliases; failedAliases: string[] }> {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error("canonical name required");
  const { data: person, error } = await db()
    .from("people")
    .insert({ canonical_name: canonicalName, reading: input.reading?.trim() || null })
    .select("*")
    .single();
  if (error) throw error;
  const row = person as PersonRow;

  const aliasSet = new Set<string>([canonicalName, ...(input.aliases ?? []).map((a) => a.trim()).filter(Boolean)]);
  const registered: AliasRef[] = [];
  const failed: string[] = [];
  for (const alias of aliasSet) {
    const { data: aliasRow, error: aliasErr } = await db().from("person_aliases").insert({ person_id: row.id, alias }).select("id, alias").single();
    if (aliasErr) failed.push(alias);
    else registered.push(aliasRow as AliasRef);
  }
  // canonical_name自体が既に他の人物に登録済みだった場合、この人物は名寄せに使えないため作成ごと取り消す。
  if (!registered.some((a) => a.alias === canonicalName)) {
    await db().from("people").delete().eq("id", row.id);
    throw new DuplicateAliasError(`「${canonicalName}」は既に別の人物に登録されています。`);
  }
  const personWithAliases: PersonWithAliases = { ...row, aliases: registered.filter((a) => a.alias.toLowerCase() !== canonicalName.toLowerCase()) };
  return { person: personWithAliases, failedAliases: failed };
}

export async function addAlias(personId: string, alias: string): Promise<AliasRef> {
  const trimmed = alias.trim();
  if (!trimmed) throw new Error("alias required");
  const { data, error } = await db().from("person_aliases").insert({ person_id: personId, alias: trimmed }).select("id, alias").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new DuplicateAliasError(`「${trimmed}」は既に登録されています。`);
    throw error;
  }
  return data as AliasRef;
}

export async function deleteAlias(personId: string, aliasId: string): Promise<boolean> {
  const { data, error } = await db().from("person_aliases").delete().eq("id", aliasId).eq("person_id", personId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 人物ごと削除する（表記ゆれ・紐づく出会い記録もcascade/set nullで一緒に片付く）。 */
export async function deletePerson(personId: string): Promise<boolean> {
  const { data, error } = await db().from("people").delete().eq("id", personId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export interface NewEncounterInput {
  personId: string | null;
  personRawName: string;
  summary: string;
}

/** 日記本文からの抽出結果で、その日(owner,date)の出会い記録を丸ごと置き換える（冪等。extract-money・
 * extract-people系エンドポイントの再実行時に重複が積み上がらないようにするため）。 */
export async function replaceJournalEncounters(ownerId: string, date: string, entries: NewEncounterInput[]): Promise<JournalEncounterRow[]> {
  const { error: delErr } = await db().from("journal_encounters").delete().eq("owner", ownerId).eq("date", date);
  if (delErr) throw delErr;
  if (entries.length === 0) return [];
  const prepared = entries.map((e) => ({ owner: ownerId, date, person_id: e.personId, person_raw_name: e.personRawName, summary: e.summary }));
  const { data, error } = await db().from("journal_encounters").insert(prepared).select("*");
  if (error) throw error;
  return (data ?? []) as JournalEncounterRow[];
}

export interface VCardContact {
  name: string;
  nicknames: string[];
}

/** iPhone連絡先などのvCard(.vcf)テキストから、氏名(FN)とニックネーム(NICKNAME)を抜き出す。
 * 折り返し行や住所・電話番号など他のプロパティは無視する（名前の名寄せ台帳の初期投入だけが目的）。 */
export function parseVCard(text: string): VCardContact[] {
  const contacts: VCardContact[] = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    const lines = card.split(/\r\n|\r|\n/);
    let fn = "";
    let nickname = "";
    for (const rawLine of lines) {
      const idx = rawLine.indexOf(":");
      if (idx < 0) continue;
      const key = rawLine.slice(0, idx).split(";")[0].trim().toUpperCase();
      const value = rawLine.slice(idx + 1).trim();
      if (key === "FN" && !fn) fn = value;
      if (key === "NICKNAME" && !nickname) nickname = value;
    }
    if (!fn) continue;
    const nicknames = nickname
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    contacts.push({ name: fn, nicknames });
  }
  return contacts;
}

export interface VCardImportResult {
  peopleCreated: number;
  aliasesCreated: number;
  aliasesSkipped: number;
}

/** vCardから読み取った連絡先を一括登録する。同じ表記が既に別人に登録されている場合、その1件のエイリアス
 * だけをスキップし（aliasesSkippedで報告）、他の連絡先の登録は止めない。 */
export async function importVCardContacts(contacts: VCardContact[]): Promise<VCardImportResult> {
  if (contacts.length === 0) return { peopleCreated: 0, aliasesCreated: 0, aliasesSkipped: 0 };

  const peopleRows = contacts.map((c) => ({ id: randomUUID(), canonical_name: c.name }));
  const { error: peopleErr } = await db().from("people").insert(peopleRows);
  if (peopleErr) throw peopleErr;

  const aliasRows: { person_id: string; alias: string }[] = [];
  contacts.forEach((c, i) => {
    const personId = peopleRows[i].id;
    const aliasSet = new Set<string>([c.name, ...c.nicknames].map((a) => a.trim()).filter(Boolean));
    for (const alias of aliasSet) aliasRows.push({ person_id: personId, alias });
  });

  let aliasesCreated = 0;
  let aliasesSkipped = 0;
  for (const row of aliasRows) {
    const { error } = await db().from("person_aliases").insert(row);
    if (error) aliasesSkipped++;
    else aliasesCreated++;
  }

  return { peopleCreated: peopleRows.length, aliasesCreated, aliasesSkipped };
}
