import "server-only";
import { db } from "./db";
import { businessDateJST, periodRange } from "./date";
import { fetchJpyRate } from "./currency";
import { addItemHistoryEntries, type NewItemHistoryEntry } from "./itemHistory";
import { VALID_ACCOUNT_IDS } from "./constants";
import { isMaskedForViewer } from "./aggregate";
import type { AccountId, ExpenseRow } from "./types";

const VALID_ACCOUNTS: AccountId[] = VALID_ACCOUNT_IDS;

export interface NewExpenseInput {
  date?: string | null;
  account_id: string;
  category: string;
  sub?: string | null;
  amount: number;
  memo?: string | null;
  /** 海外通貨で入力した場合の元通貨・元金額。指定時はamountを無視し、そのつど取得した為替レートから再計算する
   * （クライアントやAIが申告したレートは信用しない）。 */
  original_currency?: string | null;
  original_amount?: number | null;
  /** レシートOCR等で読み取れた購入品ごとの{name, price}（あれば）。品目履歴（検索専用）に残す。
   * 未指定ならmemoを1件（金額はこの支出全体の金額）として残す。 */
  items?: { name: string; price?: number | null }[] | null;
}

export interface PreparedExpense {
  date: string;
  account_id: AccountId;
  category: string;
  sub: string | null;
  amount: number;
  memo: string;
  original_currency: string | null;
  original_amount: number | null;
  exchange_rate: number | null;
}

export class ValidationError extends Error {}

async function validateEntry(input: NewExpenseInput, allCats: string[]): Promise<PreparedExpense> {
  if (!VALID_ACCOUNTS.includes(input.account_id as AccountId)) {
    throw new ValidationError(`invalid account_id: ${input.account_id}`);
  }
  if (!allCats.includes(input.category)) {
    throw new ValidationError(`invalid category: ${input.category}`);
  }

  let amount = Math.round(Number(input.amount));
  let original_currency: string | null = null;
  let original_amount: number | null = null;
  let exchange_rate: number | null = null;

  if (input.original_currency) {
    const oa = Number(input.original_amount);
    if (!Number.isFinite(oa) || oa <= 0) throw new ValidationError(`invalid original_amount: ${input.original_amount}`);
    // 円換算額は常にサーバー側でその場取得したレート×元金額から計算する（クライアント申告値は信用しない）。
    // 固定の対応通貨リストは持たず、レートAPIへの問い合わせ結果で対応可否を都度判定する（新しい通貨コードにも自動対応）。
    let rate: number;
    try {
      rate = await fetchJpyRate(input.original_currency);
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : `unsupported currency: ${input.original_currency}`);
    }
    amount = Math.round(oa * rate);
    original_currency = input.original_currency.trim().toUpperCase();
    original_amount = oa;
    exchange_rate = rate;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError(`invalid amount: ${input.amount}`);
  }
  // 日付が空・未指定なら当日の日付（JST）で登録する (spec §7-1)。「当日」は午前3:30始まりの日付
  // （深夜0:00〜3:29は前日扱い）で判定する。
  const date = input.date && input.date.trim() ? input.date.trim() : businessDateJST();
  return {
    date,
    account_id: input.account_id as AccountId,
    category: input.category,
    sub: input.category === "その他" && input.sub?.trim() ? input.sub.trim() : null,
    amount,
    memo: input.memo?.trim() ?? "",
    original_currency,
    original_amount,
    exchange_rate,
  };
}

/** 支出を追加する。§7 "その他"→カスタムカテゴリ昇格ルールをDB関数内でアトミックに適用する。
 * 支出自体は「誰の支出か」未指定（owner=null、2人の支出）で登録される — 何のボタンも押していない
 * 標準状態は家族全員の支出として扱う。`ownerId`は品目履歴（検索専用）の記録者としてのみ使う。
 * 戻り値のentriesは実際に円換算された最終金額を含む（外貨入力時の確認メッセージ表示などに使う）。 */
export async function addExpenseEntries(
  ownerId: string,
  entries: NewExpenseInput[],
  allCats: string[]
): Promise<{ promoted: string[]; entries: PreparedExpense[] }> {
  if (entries.length === 0) return { promoted: [], entries: [] };
  const prepared = await Promise.all(entries.map((e) => validateEntry(e, allCats)));
  const { data, error } = await db().rpc("add_expense_entries", {
    p_owner: ownerId,
    p_entries: prepared,
  });
  if (error) throw error;
  const row = (data as { promoted: string[]; ids: string[] }[] | null)?.[0];
  const promoted = row?.promoted ?? [];
  const expenseIds = row?.ids ?? [];

  // 品目履歴（検索専用）への記録はベストエフォート。失敗しても支出登録自体は成功として扱う。
  try {
    await Promise.all(
      entries.map((e, i) => {
        const items: NewItemHistoryEntry[] =
          e.items && e.items.length > 0
            ? e.items.map((it) => ({ name: it.name, amount: it.price ?? null }))
            : prepared[i].memo
              ? [{ name: prepared[i].memo, amount: prepared[i].amount }]
              : [];
        return items.length > 0
          ? addItemHistoryEntries(ownerId, prepared[i].date, "purchase", items, {
              store: prepared[i].memo,
              category: prepared[i].category,
              expenseId: expenseIds[i] ?? null,
            })
          : Promise.resolve();
      })
    );
  } catch (e) {
    console.error("item history logging failed", e);
  }

  return { promoted, entries: prepared };
}

/** 支出はowner未指定（＝2人の支出）が初期状態なので、編集・削除・付け替えの権限は「入力した本人か」
 * ではなく「自分から見えているか」（相手の第3口座の非公開分でないか）で判定する。見えない記録は
 * 呼び出し元でnull/false（=404扱い）として扱う。 */
type VisibleExpense = Pick<ExpenseRow, "id" | "owner" | "account_id" | "amount" | "split_num" | "split_den" | "split_total_amount">;

async function assertVisibleExpense(id: string, callerId: string): Promise<VisibleExpense | null> {
  const { data, error } = await db()
    .from("expenses")
    .select("id, owner, account_id, amount, split_num, split_den, split_total_amount")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as VisibleExpense;
  if (isMaskedForViewer(row, callerId)) return null;
  return row;
}

export async function deleteExpense(id: string, callerId: string): Promise<boolean> {
  if (!(await assertVisibleExpense(id, callerId))) return false;
  const { data, error } = await db().from("expenses").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export interface ExpensePatch {
  date?: string;
  account_id?: string;
  category?: string;
  sub?: string | null;
  amount?: number;
  memo?: string;
}

/** 既存の支出（日記由来含む）を部分更新する。渡されたフィールドのみ検証・反映。 */
export async function updateExpense(id: string, callerId: string, patch: ExpensePatch, allCats: string[]): Promise<ExpenseRow | null> {
  const current = await assertVisibleExpense(id, callerId);
  if (!current) return null;

  const update: Record<string, unknown> = {};
  if (patch.account_id !== undefined) {
    if (!VALID_ACCOUNTS.includes(patch.account_id as AccountId)) throw new ValidationError(`invalid account_id: ${patch.account_id}`);
    update.account_id = patch.account_id;
  }
  if (patch.category !== undefined) {
    if (!allCats.includes(patch.category)) throw new ValidationError(`invalid category: ${patch.category}`);
    update.category = patch.category;
  }
  if (patch.amount !== undefined) {
    const amount = Math.round(Number(patch.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`invalid amount: ${patch.amount}`);
    update.amount = amount;
    // 割り勘中の記録では、一覧・編集欄に出ている金額は「自分たちの負担分」なので、
    // 編集された金額も負担分とみなし、立て替えた全額のほうを比率から逆算し直す。
    if (current.split_num && current.split_den) {
      update.split_total_amount = Math.round((amount * current.split_den) / current.split_num);
    }
  }
  if (patch.date !== undefined && patch.date.trim()) update.date = patch.date.trim();
  if (patch.memo !== undefined) update.memo = patch.memo.trim();
  if (patch.sub !== undefined) update.sub = patch.sub?.trim() || null;

  const { data, error } = await db().from("expenses").update(update).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ExpenseRow;
}

/** 友達との割り勘の後付け設定。numが人数分の分子（自分たちの人数）、denが合計人数。
 * 立て替えた全額をsplit_total_amountに残し、amountを実質負担分（全額×num/den）に置き換えるので、
 * 口座・カテゴリ・グラフなどの既存の集計はそのまま実質負担額ベースになる。
 * num=nullで割り勘を解除し、amountを立て替えた全額に戻す。 */
export async function updateExpenseSplit(
  id: string,
  callerId: string,
  split: { num: number; den: number } | null
): Promise<ExpenseRow | null> {
  const current = await assertVisibleExpense(id, callerId);
  if (!current) return null;

  // 割り勘を設定し直す場合も、基準は常に「立て替えた全額」。掛け算が重ならないようにする。
  const fullAmount = current.split_total_amount ?? current.amount;

  const update =
    split === null
      ? { amount: fullAmount, split_num: null, split_den: null, split_total_amount: null }
      : (() => {
          if (!Number.isInteger(split.num) || !Number.isInteger(split.den)) throw new ValidationError("invalid split");
          if (split.den < 1 || split.num < 1 || split.num > split.den) throw new ValidationError("invalid split");
          return {
            amount: Math.round((fullAmount * split.num) / split.den),
            split_num: split.num,
            split_den: split.den,
            split_total_amount: fullAmount,
          };
        })();

  const { data, error } = await db().from("expenses").update(update).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ExpenseRow;
}

/** 「誰の支出か」の後付けタグ変更。newOwner=nullは「2人の支出（共通）」を表す。 */
export async function updateExpenseOwner(id: string, callerId: string, newOwner: string | null): Promise<ExpenseRow | null> {
  if (!(await assertVisibleExpense(id, callerId))) return null;

  const { data, error } = await db().from("expenses").update({ owner: newOwner }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ExpenseRow;
}

export interface JournalExpenseInput {
  account_id: string;
  category: string;
  amount: number;
  memo: string;
}

/** 日記本文から抽出した支出をsource='journal'として登録する。同じ日の日記由来分は再保存のたびに置き換え（冪等）。 */
export async function replaceJournalExpenses(
  ownerId: string,
  date: string,
  entries: JournalExpenseInput[],
  allCats: string[]
): Promise<ExpenseRow[]> {
  const { error: delErr } = await db().from("expenses").delete().eq("owner", ownerId).eq("date", date).eq("source", "journal");
  if (delErr) throw delErr;
  if (entries.length === 0) return [];

  const prepared = entries.map((e) => {
    if (!VALID_ACCOUNTS.includes(e.account_id as AccountId)) throw new ValidationError(`invalid account_id: ${e.account_id}`);
    if (!allCats.includes(e.category)) throw new ValidationError(`invalid category: ${e.category}`);
    const amount = Math.round(Number(e.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`invalid amount: ${e.amount}`);
    return {
      owner: ownerId,
      date,
      account_id: e.account_id,
      category: e.category,
      sub: null,
      amount,
      memo: e.memo?.trim() ?? "",
      source: "journal",
    };
  });
  const { data, error } = await db().from("expenses").insert(prepared).select("*");
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

/** cron専用: 定期支払（recurring_expenses）から、その支払日のexpensesを1件生成する（source='recurring'）。 */
export async function createExpenseFromRecurring(
  ownerId: string,
  date: string,
  input: { account_id: string; category: string; amount: number; memo: string }
): Promise<ExpenseRow> {
  const { data, error } = await db()
    .from("expenses")
    .insert({ owner: ownerId, date, account_id: input.account_id, category: input.category, sub: null, amount: input.amount, memo: input.memo, source: "recurring" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ExpenseRow;
}

/** その日の、日記から自動抽出された支出のみ（レビュー・編集UI用）。 */
export async function getJournalExpensesForDate(ownerId: string, date: string): Promise<ExpenseRow[]> {
  const { data, error } = await db()
    .from("expenses")
    .select("*")
    .eq("owner", ownerId)
    .eq("date", date)
    .eq("source", "journal")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

export async function getExpensesInRange(fromDate: string, toDateExclusive: string): Promise<ExpenseRow[]> {
  const { data, error } = await db()
    .from("expenses")
    .select("*")
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

/** 家計上の「月」(25日始まり・翌月24日締め)の日付範囲。lib/date.tsのperiodRangeが正。 */
export function monthRange(monthKey: string): { from: string; toExclusive: string } {
  return periodRange(monthKey);
}
