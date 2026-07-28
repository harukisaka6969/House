-- 定期支払（サブスク・保険など）。毎月day_of_monthに自動でexpensesへ1件生成する（source='recurring'）。
-- 月末29〜31日は月によって存在しないため、シンプルに1〜28日のみ対応する。
create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  account_id text not null,
  category text not null,
  amount numeric not null,
  memo text not null default '',
  day_of_month int not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  last_generated_month text,
  created_at timestamptz not null default now()
);

create index if not exists recurring_expenses_owner_idx on recurring_expenses (owner);
create index if not exists recurring_expenses_active_day_idx on recurring_expenses (active, day_of_month);
