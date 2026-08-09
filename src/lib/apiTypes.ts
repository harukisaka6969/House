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
    }
  | { id: string; account_id: AccountId; category: string; owner_name: string; masked: true };

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
  needs_approval: boolean;
  approved: boolean;
  approved_by_name: string | null;
  bought: boolean;
  created_at: string;
}

export interface MeResponse {
  profile: { id: string; slug: string; name: string; role: "owner" | "family" | "kiosk" };
  partner: { name: string; slug: string } | null;
}

export interface FamilyAccountOut {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface SettingsResponse {
  profile: { id: string; slug: string; name: string };
  /** 固定カテゴリ＋自動追加カテゴリ＋「その他」を合わせた選択肢一覧（ピッカー用）。 */
  allCategories: string[];
  /** 「その他」の学習結果として自動追加されたカテゴリのみ（削除管理UI用）。 */
  customCategories: string[];
  accounts: AccountOut[];
  familyAccounts: FamilyAccountOut[];
  kioskConfigured: boolean;
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

export interface PfcTargetOut {
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
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
