-- 「今日の支出はgoodだったかbadだったか」を1日1件、スワイプで記録する機能用。
-- 同じ日に再スワイプしたら上書き（unique制約 + upsert）。
create table if not exists expense_sentiments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  total int not null,
  sentiment text not null check (sentiment in ('good', 'bad')),
  created_at timestamptz not null default now(),
  unique (owner, date)
);
