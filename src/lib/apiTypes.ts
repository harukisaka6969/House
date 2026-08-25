import type { AccountId, Judge } from "./types";

export interface AccountOut {
  id: AccountId;
  name: string;
  color: string;
  budget: number;
  sort: number;
}

export interface AccountAggregateOut extends AccountOut {
  spent: number;
  spentMine: number;
  judge: Judge;
}

export type ExpenseOut =
  | {
      id: string;
      date: string;
      account_id: AccountId;
      category: string;
      sub: string | null;
      amount: number;
      memo: string;
      created_at: string;
      owner_name: string;
      masked: false;
      source: string;
      original_currency: string | null;
      original_amount: number | null;
      exchange_rate: number | null;
    }
  | { id: string; account_id: AccountId; category: string; owner_name: string; masked: true };

export interface CurrencyRateOut {
  currency: string;
  rate: number;
}

export interface IncomeOut {
  id: string;
  month: string;
  name: string;
  amount: number;
  owner: string | null;
  owner_name: string | null;
}

export interface InvestmentOut {
  id: string;
  owner: string;
  date: string;
  name: string;
  amount: number;
  memo: string;
  created_at: string;
  owner_name: string;
}

export interface MonthResponse {
  month: string;
  incomes: IncomeOut[];
  expenses: ExpenseOut[];
  investments: InvestmentOut[];
  aggregates: {
    perAccount: AccountAggregateOut[];
    monthTotals: { income: number; expense: number; invest: number };
    perCategory: { name: string; value: number }[];
    perDay: Record<string, number>;
    cumInvest: number;
  };
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  invest: number;
}

export interface FlowMonthPoint {
  month: string;
  incomeTotal: number;
  incomeRegular: number;
  incomeSpecial: number;
  expenseTotal: number;
  expenseByCategory: { name: string; value: number }[];
  investTotal: number;
  net: number;
  cumulativeNet: number;
}

export interface FlowSpecialEvent {
  type: "income" | "expense";
  date: string;
  name: string;
  amount: number;
  ownerName: string;
}

export interface FlowAnalysisResponse {
  months: FlowMonthPoint[];
  specialEvents: FlowSpecialEvent[];
  categories: string[];
}

export type IdeaNoteColor = "yellow" | "blue" | "green" | "pink" | "purple";
export type IdeaNoteVisibility = "private" | "shared";

export interface IdeaBoardOut {
  id: string;
  name: string;
  shared: boolean;
  created_at: string;
}

export interface IdeaNoteOut {
  id: string;
  owner: string;
  owner_name: string;
  board_id: string;
  board_name: string | null;
  title: string;
  content: string;
  photo_data_url: string | null;
  color: IdeaNoteColor;
  x: number;
  y: number;
  visibility: IdeaNoteVisibility;
  effectively_shared: boolean;
  mine: boolean;
  created_at: string;
}

export interface IdeaNoteLinkOut {
  id: string;
  from_note: string;
  to_note: string;
}

export type ShoppingStore = "seiyu" | "amazon" | "conveni" | "other";

export interface ShoppingItemOut {
  id: string;
  owner: string;
  owner_name: string;
  name: string;
  store: ShoppingStore;
  url: string | null;
  needs_approval: boolean;
  approved: boolean;
  approved_by_name: string | null;
  bought: boolean;
  created_at: string;
}

export interface MeResponse {
  profile: { id: string; slug: string; name: string; role: "owner" | "family" | "kiosk" };
  partner: { id: string; name: string; slug: string } | null;
}

export interface FamilyAccountOut {
  id: string;
  slug: string;
  name: string;
  auth_method: "pin" | "pattern";
  created_at: string;
}

export interface SettingsResponse {
  profile: { id: string; slug: string; name: string; authMethod: "pin" | "pattern" };
  /** 固定カテゴリ＋自動追加カテゴリ＋「その他」を合わせた選択肢一覧（ピッカー用）。 */
  allCategories: string[];
  /** 「その他」の学習結果として自動追加されたカテゴリのみ（削除管理UI用）。 */
  customCategories: string[];
  accounts: AccountOut[];
  familyAccounts: FamilyAccountOut[];
  kioskConfigured: boolean;
  kioskAuthMethod: "pin" | "pattern" | null;
  lineUserId: string | null;
  lineNotifyAvailable: boolean;
  lineReminderTime: string | null;
}

/* ---- v2 ---- */

export interface AssetOut {
  id: string;
  name: string;
  kind: "car" | "house" | "appliance" | "other";
  acquired_date: string | null;
  memo: string;
}

export interface MaintenanceTaskOut {
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

export interface MaintenanceLogOut {
  id: string;
  task_id: string;
  done_date: string;
  actual_cost: number;
  memo: string;
  expense_id: string | null;
  created_at: string;
}

export interface WishlistItemOut {
  id: string;
  owner: string;
  owner_name: string;
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
  status: "planning" | "saving" | "purchased" | "dropped";
  purchased_date: string | null;
  purchased_price: number | null;
  visible_to_family: boolean;
  created_at: string;
}

export interface LifeEventOut {
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
  status: "active" | "done" | "cancelled";
  visible_to_family: boolean;
  created_at: string;
}

export interface AnniversaryOut {
  id: string;
  name: string;
  date: string;
  memo: string;
  created_at: string;
}

export interface TimelineChildOut {
  date: string;
  title: string;
  amount: number;
}

export interface TimelineItemOut {
  date: string;
  kind: "expense" | "diary";
  title: string;
  description: string;
  amount?: number;
  children?: TimelineChildOut[];
  major?: boolean;
}

export interface YearTimelineOut {
  items: TimelineItemOut[];
  highlightsGeneratedAt: string | null;
}

export interface UpcomingSummary {
  windowDays: number;
  maintenanceCount: number;
  maintenanceCost: number;
  wishlistCount: number;
  wishlistMonthlyPlan: number;
  total: number;
}

export interface JournalEntryOut {
  id: string;
  owner: string;
  owner_name: string;
  date: string;
  body: string;
  updated_at: string;
}

export interface SportLogOut {
  id: string;
  owner: string;
  owner_name: string;
  date: string;
  activity: string;
  duration_minutes: number | null;
  distance_km: number | null;
  memo: string;
}

export type RehabLogKind = "impulse" | "dignity" | "reframe" | "love_check";

export interface RehabLogOut {
  id: string;
  date: string;
  kind: RehabLogKind;
  data: Record<string, unknown>;
  created_at: string;
}

export interface GymSetEntry {
  weight: number;
  reps: number;
}

export interface GymSplitOut {
  id: string;
  code: string;
  label: string;
  sort: number;
}

export type GymExerciseType = "strength" | "cardio";

export interface GymExerciseOut {
  id: string;
  split_id: string;
  name: string;
  type: GymExerciseType;
  sort: number;
  active: boolean;
}

export interface GymLogOut {
  id: string;
  exercise_id: string;
  date: string;
  sets: GymSetEntry[];
  duration_minutes: number | null;
  distance_km: number | null;
  note: string;
  created_at: string;
}

export interface RecurringExpenseOut {
  id: string;
  account_id: AccountId;
  category: string;
  amount: number;
  memo: string;
  day_of_month: number;
  active: boolean;
  last_generated_month: string | null;
}

export interface MealLogOut {
  id: string;
  date: string;
  description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  created_at: string;
}

/** calories/protein_g/fat_g/carb_gはtotal_weight_gぶん全体の合計値（1食分ではない）。 */
export interface MealPrepOut {
  id: string;
  name: string;
  total_weight_g: number;
  remaining_weight_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  created_at: string;
}

export interface PfcTargetOut {
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export interface BodyGoalOut {
  body_fat_pct_target: number | null;
  muscle_trend_kg_per_4w: number | null;
  target_weight: number | null;
  target_lbm: number | null;
  target_date: string | null;
}

export interface WeeklyBodyReviewOut {
  score: number;
  components: { nutrition: number | null; training: number | null; bodyComp: number | null };
  good: string[];
  improve: string[];
  facts: string[];
}

export interface InventoryItemOut {
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

/* ---- family (read-only, whitelisted) ---- */

export interface FamilyWishlistOut {
  id: string;
  name: string;
  category: string | null;
  price: number;
  target_date: string | null;
  priority: number;
}

export interface FamilyLifeEventOut {
  id: string;
  name: string;
  event_year: number;
  event_month: number | null;
  cost_low: number;
  cost_high: number;
  memo: string;
}

export interface FamilyMaintenanceTaskOut {
  id: string;
  asset_id: string;
  asset_name: string;
  name: string;
  est_cost: number;
  next_due: string;
}

export interface FamilyAssetOut {
  id: string;
  name: string;
  kind: "car" | "house" | "appliance" | "other";
}

export interface FamilyTimelineItem {
  type: "maintenance" | "wishlist" | "life_event";
  id: string;
  name: string;
  cost: number;
}

export interface FamilyTimelineMonth {
  month: string;
  items: FamilyTimelineItem[];
  subtotal: number;
}

export interface FamilyOverviewResponse {
  timeline: FamilyTimelineMonth[];
  wishlist: FamilyWishlistOut[];
  lifeEvents: FamilyLifeEventOut[];
  maintenance: FamilyMaintenanceTaskOut[];
  assets: FamilyAssetOut[];
}

export interface RecordMetric {
  label: string;
  value: string;
}

/** 体組成の記録（体重を含む記録）を登録した際に、自動で見直された食事のPFC目標。 */
export interface PfcUpdateOut extends PfcTargetOut {
  message: string;
}

export interface PersonalRecordOut {
  id: string;
  category: string;
  date: string;
  title: string;
  metrics: RecordMetric[];
  memo: string;
  created_at: string;
}

export interface RecordCategorySummary {
  category: string;
  count: number;
  lastDate: string;
}

export type DigestKind = "daily" | "weekly";

export interface DigestOut {
  kind: DigestKind;
  period_key: string;
  body: string;
  created_at: string;
}

export interface DigestsResponse {
  daily: DigestOut | null;
  weekly: DigestOut | null;
}

export type RecurrenceType = "daily" | "weekly" | "monthly";

export interface ReminderOut {
  id: string;
  name: string;
  recurrence_type: RecurrenceType;
  day_of_week: number | null;
  day_of_month: number | null;
  memo: string;
  active: boolean;
  next_date: string;
  last_completed_date: string | null;
  done_today: boolean;
  notify_time: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
}

export interface KioskPersonColumn {
  id: string;
  slug: string;
  name: string;
  shoppingItems: ShoppingItemOut[];
}

export interface KioskAccountSummary {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
  judgeLabel: string;
  judgeTone: string;
}

export interface KioskResponse {
  monthKey: string;
  income: number;
  expense: number;
  invest: number;
  judgeLabel: string;
  judgeTone: string;
  accounts: KioskAccountSummary[];
  reminders: ReminderOut[];
  left: KioskPersonColumn;
  right: KioskPersonColumn;
  notifications: {
    pendingApprovalItems: { id: string; name: string; owner_name: string }[];
    remindersToday: { id: string; name: string }[];
    lowStockItems: { id: string; name: string }[];
  };
}

export interface SwitchBotDeviceOut {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  remoteType?: string;
  status: Record<string, unknown> | null;
  room: string | null;
}

export interface SwitchBotDevicesResponse {
  devices: SwitchBotDeviceOut[];
  infraredRemotes: SwitchBotDeviceOut[];
}

export interface SplitEventOut {
  id: string;
  name: string;
  created_by: string;
  share_token: string;
  created_at: string;
}

export interface SplitParticipantOut {
  id: string;
  name: string;
}

export interface SplitExpenseOut {
  id: string;
  payerId: string;
  payerName: string;
  amount: number;
  memo: string;
  date: string;
  beneficiaryIds: string[];
  beneficiaryNames: string[];
}

export interface SplitBalanceOut {
  participantId: string;
  name: string;
  paid: number;
  owed: number;
  net: number;
}

export interface SplitSettlementTxnOut {
  from: string;
  to: string;
  amount: number;
}

export interface SplitEventDetailOut {
  event: { id: string; name: string };
  participants: SplitParticipantOut[];
  expenses: SplitExpenseOut[];
  balances: SplitBalanceOut[];
  settlement: SplitSettlementTxnOut[];
}

export interface PendingExpenseSentimentOut {
  date: string;
  hasExpenses: boolean;
  total: number;
  sentiment: "good" | "bad" | null;
  pending: boolean;
}

export interface SavingsActionOut {
  id: string;
  owner: string;
  owner_name: string;
  date: string;
  description: string;
  title: string;
  /** カード作成分＋履歴の累積節約額。 */
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
  created_at: string;
  /** 同じ習慣を実施した回数（カード自身の初回分を含む）。 */
  occurrence_count: number;
  /** 最後に実施した日付。 */
  last_date: string;
}

/** 節約履歴（カレンダー・日ごとの一覧）用の1件。カードの初回分＋各実施ログを平坦化したもの。
 * action_idがnullなのは、カードを作らない単独記録（割引購入・ポイント等での無料入手）。 */
export interface SavingsHistoryOut {
  id: string;
  action_id: string | null;
  owner: string;
  owner_name: string;
  date: string;
  title: string;
  emoji: string;
  estimated_saving: number;
}

export interface PersonOut {
  id: string;
  canonical_name: string;
  reading: string | null;
  memo: string;
  /** canonical_name自身は含まない、それ以外の表記ゆれ一覧。 */
  aliases: { id: string; alias: string }[];
  /** 自分がこの人物と最後に会った日（自分の日記に記録が無ければnull）。 */
  last_date: string | null;
  last_summary: string | null;
  encounter_count: number;
}

export interface JournalEncounterOut {
  id: string;
  date: string;
  person_id: string | null;
  person_raw_name: string;
  summary: string;
}

export interface ItemHistoryOut {
  id: string;
  owner: string;
  owner_name: string;
  date: string;
  name: string;
  source: "purchase" | "meal";
  store: string;
  category: string;
  amount: number | null;
}

export interface PeriodTotalsOut {
  thisWeek: number;
  thisMonth: number;
  past3m: number;
  past6m: number;
  pastYear: number;
  allTime: number;
}

export interface ItemHistoryAggregatesOut {
  byItem: { query: string; totals: PeriodTotalsOut; unknownCount: number } | null;
  byStore: { query: string; totals: PeriodTotalsOut } | null;
  byCategory: { query: string; totals: PeriodTotalsOut } | null;
}
