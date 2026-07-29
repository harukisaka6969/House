export type AccountId = "a1" | "a2" | "a3" | "a4";

export interface Account {
  id: AccountId;
  name: string;
  color: string;
  budget: number;
  sort: number;
}

export type ProfileRole = "owner" | "family";

export interface Profile {
  id: string;
  slug: string;
  name: string;
  role: ProfileRole;
}

/** Raw expense row as stored in the DB (owner's own view — never masked). */
export interface ExpenseRow {
  id: string;
  owner: string;
  date: string; // YYYY-MM-DD
  account_id: AccountId;
  category: string;
  sub: string | null;
  amount: number;
  memo: string;
  created_at: string;
  /** 'manual'（通常入力・文章解析・OCR含む）| 'journal'（日記本文からAI自動抽出）。 */
  source: string;
}

/** Expense as returned by the API — may be masked for the partner's private-account rows. */
export type ExpenseOut =
  | (Omit<ExpenseRow, "owner"> & { owner_name: string; masked?: false })
  | { id: string; account_id: AccountId; category: string; owner_name: string; masked: true };

export interface IncomeRow {
  id: string;
  month: string;
  name: string;
  amount: number;
  owner: string | null;
}

export interface InvestmentRow {
  id: string;
  owner: string;
  date: string;
  name: string;
  amount: number;
  memo: string;
  created_at: string;
}

export interface Judge {
  label: string;
  tone: "good" | "ok" | "warn" | "bad" | "muted";
  note?: string;
}

export interface AccountAggregate extends Account {
  spent: number;
  spentMine: number;
  judge: Judge;
}

export interface MonthAggregates {
  income: number;
  expense: number;
  invest: number;
  balance: number;
  perAccount: AccountAggregate[];
  perCategory: { name: string; value: number }[];
  perDay: Record<string, number>;
  judge: Judge;
  trend: { month: string; 収入: number; 支出: number; 投資: number }[];
  prev: { income: number; expense: number; invest: number } | null;
  cumInvest: number;
  topCats: { name: string; value: number }[];
}

/* ---- v2: wishlist / life events / maintenance (kakeibowebspec-v2.md) ---- */

export type WishlistStatus = "planning" | "saving" | "purchased" | "dropped";

export interface WishlistItemRow {
  id: string;
  owner: string;
  is_private: boolean;
  name: string;
  category: string | null;
  price: number;
  priority: number;
  target_date: string | null;
  saved: number;
  monthly_plan: number;
  url: string | null;
  memo: string;
  status: WishlistStatus;
  purchased_date: string | null;
  purchased_price: number | null;
  visible_to_family: boolean;
  created_at: string;
}

export type ShoppingStore = "seiyu" | "amazon" | "conveni" | "other";

/** 買い物リスト（夫婦で共有）。Amazon・その他はパートナーの承認が必要（needs_approval）。 */
export interface ShoppingItemRow {
  id: string;
  owner: string;
  name: string;
  store: ShoppingStore;
  needs_approval: boolean;
  approved: boolean;
  approved_by: string | null;
  bought: boolean;
  bought_at: string | null;
  created_at: string;
}

export type LifeEventStatus = "active" | "done" | "cancelled";

export interface LifeEventRow {
  id: string;
  name: string;
  event_year: number;
  event_month: number | null;
  cost_low: number;
  cost_high: number;
  cost_basis: string;
  funded: number;
  monthly_saving: number;
  linked: boolean;
  memo: string;
  status: LifeEventStatus;
  visible_to_family: boolean;
  created_at: string;
}

export type AssetKind = "car" | "house" | "appliance" | "other";

export interface AssetRow {
  id: string;
  name: string;
  kind: AssetKind;
  acquired_date: string | null;
  memo: string;
}

export interface MaintenanceTaskRow {
  id: string;
  asset_id: string;
  name: string;
  interval_months: number | null;
  est_cost: number;
  next_due: string;
  memo: string;
  active: boolean;
  visible_to_family: boolean;
}

export interface MaintenanceLogRow {
  id: string;
  task_id: string;
  done_date: string;
  actual_cost: number;
  memo: string;
  expense_id: string | null;
  created_at: string;
}

/* ---- 日記・スポーツ記録 ---- */

export interface JournalEntryRow {
  id: string;
  owner: string;
  date: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface SportLogRow {
  id: string;
  owner: string;
  date: string;
  activity: string;
  duration_minutes: number | null;
  distance_km: number | null;
  memo: string;
  created_at: string;
}

export type RehabLogKind = "impulse" | "dignity" | "reframe" | "love_check";

/** 個人の振り返り記録（本人のみ閲覧・入力可）。kindごとにdataの中身が異なる。 */
export interface RehabLogRow {
  id: string;
  owner: string;
  date: string;
  kind: RehabLogKind;
  data: Record<string, unknown>;
  created_at: string;
}

/* ---- 筋トレログ ---- */

export interface GymSetEntry {
  weight: number;
  reps: number;
}

export interface GymSplitRow {
  id: string;
  owner: string;
  code: string;
  label: string;
  sort: number;
  created_at: string;
}

export type GymExerciseType = "strength" | "cardio";

export interface GymExerciseRow {
  id: string;
  split_id: string;
  owner: string;
  name: string;
  type: GymExerciseType;
  sort: number;
  created_at: string;
}

export interface GymLogRow {
  id: string;
  owner: string;
  exercise_id: string;
  date: string;
  sets: GymSetEntry[];
  duration_minutes: number | null;
  distance_km: number | null;
  note: string;
  created_at: string;
}

/** 定期支払（サブスク・保険など）。毎月day_of_monthにexpensesへ自動生成される（source='recurring'）。 */
export interface RecurringExpenseRow {
  id: string;
  owner: string;
  account_id: AccountId;
  category: string;
  amount: number;
  memo: string;
  day_of_month: number;
  active: boolean;
  last_generated_month: string | null;
  created_at: string;
}

/* ---- 食事記録・PFC目標 ---- */

export interface MealLogRow {
  id: string;
  owner: string;
  date: string;
  description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  created_at: string;
}

export interface PfcTargetRow {
  owner: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  updated_at: string;
}

/* ---- 在庫管理（消耗品）---- */

export interface InventoryItemRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  memo: string;
  created_at: string;
  updated_at: string;
}
