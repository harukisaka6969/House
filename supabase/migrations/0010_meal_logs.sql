-- 食事記録: 写真からAIが推定したカロリー・PFCを1食ごとに記録する（画像自体は保存しない）。
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  description text not null default '',
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carb_g numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meal_logs_owner_date_idx on meal_logs (owner, date);

-- 目標PFC・カロリー。1人1件（upsert）。
create table if not exists pfc_targets (
  owner uuid primary key references profiles(id) on delete cascade,
  calories numeric not null,
  protein_g numeric not null,
  fat_g numeric not null,
  carb_g numeric not null,
  updated_at timestamptz not null default now()
);
