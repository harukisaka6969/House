export type AccountId = "a1" | "a2" | "a3" | "a4";

export interface Account {
  id: AccountId;
  name: string;
  color: string;
  budget: number;
  sort: number;
}

export type ProfileRole = "owner" | "family" | "kiosk";

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
  approved_at: string | null;
  bought: boolean;
  bought_at: string | null;
  created_at: string;
}

/** アプリアイコンのバッジ通知用に「いつ見たか」を記録する。 */
export interface NotificationReadRow {
  owner: string;
  shopping_seen_at: string;
  meals_seen_at: string;
  updated_at: string;
}

export type IdeaNoteColor = "yellow" | "blue" | "green" | "pink" | "purple";
export type IdeaNoteVisibility = "private" | "shared";

/** アイデアボード（複数持てるマインドマップ群）の1枚。sharedがtrueだと中の全メモが自動的に共有扱いになる。 */
export interface IdeaBoardRow {
  id: string;
  owner: string;
  name: string;
  shared: boolean;
  created_at: string;
}

/** アイデアボード（マインドマップ）: 思いついたこと・ブレインストーム・写真を自由に残す。
 * デフォルトは本人のみ閲覧可（private）。visibility='shared'にするとパートナーも閲覧・編集・移動・接続できる。 */
export interface IdeaNoteRow {
  id: string;
  owner: string;
  board_id: string;
  title: string;
  content: string;
  photo_data_url: string | null;
  color: IdeaNoteColor;
  x: number;
  y: number;
  visibility: IdeaNoteVisibility;
  created_at: string;
}

export interface IdeaNoteLinkRow {
  id: string;
  from_note: string;
  to_note: string;
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

export type RecurrenceType = "daily" | "weekly" | "monthly";

/** 定期的にやること（ゴミ出し・ペットの薬など）。世帯で共有、owner区別なし。 */
export interface ReminderRow {
  id: string;
  name: string;
  recurrence_type: RecurrenceType;
  day_of_week: number | null;
  day_of_month: number | null;
  memo: string;
  active: boolean;
  /** 今日分を完了にした日（YYYY-MM-DD）。次回計算時にこの日と一致すれば翌回へ繰り上げる。 */
  last_completed_date: string | null;
  /** この予定になったらLINEで個別通知する時刻（JST "HH:MM"、15分刻み）。nullなら個別通知なし。 */
  notify_time: string | null;
  /** 個別通知を最後に送った日（YYYY-MM-DD）。同じ日の二重送信を防ぐ。 */
  last_notified_date: string | null;
  /** この予定を実行する人（任意）。profiles.id。 */
  assigned_to: string | null;
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

/* ---- 個人記録（写真から自動分類される任意の記録: 体組成・ランニング・ボルダリング等）---- */

export interface RecordMetric {
  label: string;
  value: string;
}

export interface PersonalRecordRow {
  id: string;
  owner: string;
  category: string;
  date: string;
  title: string;
  metrics: RecordMetric[];
  memo: string;
  created_at: string;
}

/* ---- ダイジェスト（AIによる日次・週次の振り返り）---- */

export type DigestKind = "daily" | "weekly";

export interface DigestRow {
  id: string;
  owner: string;
  kind: DigestKind;
  period_key: string;
  body: string;
  created_at: string;
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
