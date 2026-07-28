-- 個人の振り返り記録（本人のみ閲覧・入力可）。4種類: impulse/dignity/reframe/love_check。
-- 1日に複数件記録できるよう、月1件のjournal_entriesとは別テーブルにする。
create table if not exists rehab_logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('impulse', 'dignity', 'reframe', 'love_check')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rehab_logs_owner_date_idx on rehab_logs (owner, date);
