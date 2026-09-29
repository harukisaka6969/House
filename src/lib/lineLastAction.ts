import "server-only";
import { db } from "./db";
import { deleteExpense } from "./expenses";
import { deleteMealLog } from "./mealLog";
import { restoreMealPrepAmount } from "./mealPreps";
import { deleteLog as deleteGymLog } from "./gymLog";

/**
 * LINEから最後に登録した内容を1人1件だけ覚えておき、「取り消し」と送られたら消せるようにする。
 * 写真や文章を間違って送ってしまったときに、アプリを開かずLINEだけで戻せるようにするため。
 */

export type LineActionKind = "expense" | "meal" | "gym";

export interface LineActionPayload {
  expenseIds?: string[];
  mealLogIds?: string[];
  /** 作り置きを食べた記録だった場合、取り消し時に残量を戻すための情報。 */
  prepRestore?: { prepId: string; grams: number };
  gymLogIds?: string[];
}

interface LineLastActionRow {
  profile_id: string;
  kind: LineActionKind;
  payload: LineActionPayload;
  undone: boolean;
  label: string;
  created_at: string;
}

/** 取り消しの対象にする有効期限。これより古い記録は誤って消さないよう対象外にする。 */
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 1通のメッセージから複数種類を登録した場合（例「うどん500円」＝食事＋支出）に、
 * 直前の記録とまとめて1回で取り消せるようにするための合算の時間枠。 */
const MERGE_WINDOW_MS = 60 * 1000;

function mergePayloads(a: LineActionPayload, b: LineActionPayload): LineActionPayload {
  const ids = (x?: string[], y?: string[]) => {
    const merged = [...(x ?? []), ...(y ?? [])];
    return merged.length > 0 ? [...new Set(merged)] : undefined;
  };
  return {
    expenseIds: ids(a.expenseIds, b.expenseIds),
    mealLogIds: ids(a.mealLogIds, b.mealLogIds),
    gymLogIds: ids(a.gymLogIds, b.gymLogIds),
    prepRestore: b.prepRestore ?? a.prepRestore,
  };
}

/** 登録が成功したときに呼ぶ。1人1行をupsertして常に「最後の1件」だけを保持する。
 * 直前（60秒以内）の記録がまだ取り消されていなければ、同じメッセージによる登録とみなして
 * 合算する（食事＋支出を1回の「取り消し」で両方消せるようにするため）。
 * 記録自体は成功しているので、ここでの失敗は握りつぶす（取り消せないだけ）。 */
export async function recordLineAction(
  profileId: string,
  kind: LineActionKind,
  payload: LineActionPayload,
  label: string
): Promise<void> {
  try {
    const existing = await getLineLastAction(profileId);
    const mergeable =
      existing && !existing.undone && Date.now() - new Date(existing.created_at).getTime() <= MERGE_WINDOW_MS;

    const nextPayload = mergeable ? mergePayloads(existing.payload ?? {}, payload) : payload;
    const nextLabel = mergeable && existing.label && existing.label !== label ? `${existing.label} ＋ ${label}` : label;

    const { error } = await db()
      .from("line_last_actions")
      .upsert(
        {
          profile_id: profileId,
          kind,
          payload: nextPayload,
          label: nextLabel,
          undone: false,
          // 合算した場合も、最初の登録からの経過で期限切れになるよう作成時刻は引き継ぐ。
          created_at: mergeable ? existing.created_at : new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );
    if (error) throw error;
  } catch (e) {
    console.error("recordLineAction failed", e);
  }
}

async function getLineLastAction(profileId: string): Promise<LineLastActionRow | null> {
  const { data, error } = await db().from("line_last_actions").select("*").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  return (data as LineLastActionRow | null) ?? null;
}

export type UndoResult =
  | { ok: true; label: string }
  | { ok: false; reason: "none" | "expired" | "already" | "failed" };

/** 直前にLINEから登録した内容を取り消す。消せたらその内容の説明文を返す。 */
export async function undoLineLastAction(profileId: string): Promise<UndoResult> {
  const action = await getLineLastAction(profileId);
  if (!action) return { ok: false, reason: "none" };
  if (action.undone) return { ok: false, reason: "already" };
  if (Date.now() - new Date(action.created_at).getTime() > UNDO_WINDOW_MS) return { ok: false, reason: "expired" };

  const payload = action.payload ?? {};
  let removed = 0;
  try {
    // kindではなくpayloadの中身で判断する（1通のメッセージで食事＋支出を登録した場合に両方消すため）。
    for (const id of payload.expenseIds ?? []) {
      if (await deleteExpense(id, profileId)) removed++;
    }
    let mealRemoved = 0;
    for (const id of payload.mealLogIds ?? []) {
      if (await deleteMealLog(id, profileId)) mealRemoved++;
    }
    removed += mealRemoved;
    // 作り置きを食べた記録だった場合は、減らした残量も戻す。
    if (mealRemoved > 0 && payload.prepRestore) {
      await restoreMealPrepAmount(payload.prepRestore.prepId, profileId, payload.prepRestore.grams);
    }
    for (const id of payload.gymLogIds ?? []) {
      if (await deleteGymLog(id, profileId)) removed++;
    }
  } catch (e) {
    console.error("undoLineLastAction failed", e);
    return { ok: false, reason: "failed" };
  }

  if (removed === 0) return { ok: false, reason: "failed" };
  await db().from("line_last_actions").update({ undone: true }).eq("profile_id", profileId);
  return { ok: true, label: action.label };
}
