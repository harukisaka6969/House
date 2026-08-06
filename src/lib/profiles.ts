import "server-only";
import { db } from "./db";
import type { Profile } from "./types";

let cache: Profile[] | null = null;

export async function getAllProfiles(): Promise<Profile[]> {
  if (cache) return cache;
  const { data, error } = await db().from("profiles").select("id, slug, name, role");
  if (error) throw error;
  cache = (data ?? []) as Profile[];
  return cache;
}

/** 本人のLINEユーザーIDを設定・解除する（nullで解除）。 */
export async function setLineUserId(profileId: string, lineUserId: string | null): Promise<void> {
  const { error } = await db().from("profiles").update({ line_user_id: lineUserId }).eq("id", profileId);
  if (error) throw error;
}

/** 指定profileのLINEユーザーIDだけを取得する（パートナーへの通知用）。getAllProfilesとは別の独立クエリにして、
 * まだマイグレーション未適用でカラムが無い環境でも他の全機能を巻き込んで壊さないようにする。 */
export async function getLineUserId(profileId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("profiles").select("line_user_id").eq("id", profileId).maybeSingle();
    if (error) throw error;
    return (data as { line_user_id: string | null } | null)?.line_user_id ?? null;
  } catch (e) {
    console.error("getLineUserId failed", e);
    return null;
  }
}

/** LINE通知の送信対象（line_user_id設定済みのowner）一覧。同様に独立クエリで、失敗時は空配列を返す。 */
export async function getLineRecipients(): Promise<{ id: string; line_user_id: string }[]> {
  try {
    const { data, error } = await db().from("profiles").select("id, line_user_id").eq("role", "owner");
    if (error) throw error;
    return ((data ?? []) as { id: string; line_user_id: string | null }[]).filter(
      (p): p is { id: string; line_user_id: string } => !!p.line_user_id
    );
  } catch (e) {
    console.error("getLineRecipients failed", e);
    return [];
  }
}

/** LINEのユーザーIDから、紐付いているownerのprofile idを逆引きする（LINE Webhookからの操作用）。未登録なら null。 */
export async function findProfileIdByLineUserId(lineUserId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("profiles").select("id").eq("line_user_id", lineUserId).eq("role", "owner").maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.error("findProfileIdByLineUserId failed", e);
    return null;
  }
}

/** The other owner profile (never a family viewer profile) — used for "partner" lookups. */
export function findPartnerOwner(profiles: Profile[], viewerProfileId: string): Profile | null {
  return profiles.find((p) => p.role === "owner" && p.id !== viewerProfileId) ?? null;
}

export async function profileNameOf(profileId: string | null): Promise<string> {
  if (!profileId) return "共有";
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.id === profileId)?.name ?? "？";
}

export function makeNameLookup(profiles: Profile[]): (profileId: string) => string {
  const map = new Map(profiles.map((p) => [p.id, p.name]));
  return (id: string) => map.get(id) ?? "？";
}

export async function findProfileBySlug(slug: string): Promise<Profile | null> {
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.slug === slug) ?? null;
}
