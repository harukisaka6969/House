import "server-only";
import { db } from "./db";
import { hashPin as scryptHashPin, verifyPin } from "./pinHash";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function hashPin(pin: string): Promise<string> {
  return scryptHashPin(pin);
}

export type AuthMethod = "pin" | "pattern";

export interface ProfileRow {
  id: string;
  slug: string;
  name: string;
  pin_hash: string;
  auth_method: AuthMethod;
  failed_attempts: number;
  locked_until: string | null;
  role: "owner" | "family" | "kiosk";
  line_user_id: string | null;
  line_reminder_time: string | null;
  line_reminder_last_sent_date: string | null;
}

export const KIOSK_SLUG = "kiosk";
const KIOSK_NAME = "共用ダッシュボード";

export async function getProfileBySlug(slug: string): Promise<ProfileRow | null> {
  const { data, error } = await db().from("profiles").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const { data, error } = await db().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export type PinCheckResult =
  | { ok: true }
  | { ok: false; reason: "locked"; lockedUntil: string }
  | { ok: false; reason: "invalid" };

/** Verifies a PIN against a profile, applying and persisting the 5-strikes / 15-minute lockout. */
export async function checkPin(profile: ProfileRow, pin: string): Promise<PinCheckResult> {
  const now = Date.now();
  if (profile.locked_until && new Date(profile.locked_until).getTime() > now) {
    return { ok: false, reason: "locked", lockedUntil: profile.locked_until };
  }

  const valid = await verifyPin(profile.pin_hash, pin).catch(() => false);

  if (valid) {
    await db().from("profiles").update({ failed_attempts: 0, locked_until: null }).eq("id", profile.id);
    return { ok: true };
  }

  const attempts = profile.failed_attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;
  await db()
    .from("profiles")
    .update({ failed_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts, locked_until: lockedUntil })
    .eq("id", profile.id);

  if (lockedUntil) return { ok: false, reason: "locked", lockedUntil };
  return { ok: false, reason: "invalid" };
}

/** 認証方式（PIN／パターン）と資格情報を同時に更新する。パターンも既存のscryptハッシュに
 * そのまま通せる数字文字列（各点1〜9・重複なし）として渡ってくる想定。 */
export async function changeCredential(profileId: string, authMethod: AuthMethod, credential: string): Promise<void> {
  const pin_hash = await hashPin(credential);
  const { error } = await db().from("profiles").update({ pin_hash, auth_method: authMethod }).eq("id", profileId);
  if (error) throw error;
}

/** 共用ダッシュボード専用ログイン（role=kiosk）のPIN／パターンを設定する。まだ存在しなければ作成する。
 * owner本人がSettingsから任意に発行・変更できる想定（現在の資格情報の確認は不要 — 家族の管理操作）。 */
export async function setKioskPin(newCredential: string, authMethod: AuthMethod = "pin"): Promise<void> {
  const pin_hash = await hashPin(newCredential);
  const existing = await getProfileBySlug(KIOSK_SLUG);
  if (existing) {
    const { error } = await db()
      .from("profiles")
      .update({ pin_hash, auth_method: authMethod, failed_attempts: 0, locked_until: null })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await db()
    .from("profiles")
    .insert({ slug: KIOSK_SLUG, name: KIOSK_NAME, pin_hash, auth_method: authMethod, role: "kiosk" });
  if (error) throw error;
}

/** 共用ダッシュボードのPINが設定済みかどうか（Settings画面の表示用）。 */
export async function kioskPinExists(): Promise<boolean> {
  const profile = await getProfileBySlug(KIOSK_SLUG);
  return !!profile;
}

/** 共用ダッシュボードの現在の認証方式（Settings画面の表示用）。未設定ならnull。 */
export async function getKioskAuthMethod(): Promise<AuthMethod | null> {
  const profile = await getProfileBySlug(KIOSK_SLUG);
  return profile?.auth_method ?? null;
}
