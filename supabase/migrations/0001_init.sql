-- 坂家 家計フローダッシュボード — 初期スキーマ
-- 参照: kakeibowebspec.md §4

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  credential_id text unique not null,
  public_key text not null,
  counter bigint not null default 0,
  device_name text not null default '',
  transports text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index webauthn_credentials_profile_id_idx on webauthn_credentials(profile_id);

create table accounts (
  id text primary key,
  name text not null,
  color text not null,
  budget int not null default 0,
  sort int not null default 0
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  date date not null,
  account_id text not null references accounts(id),
  category text not null,
  sub text,
  amount int not null check (amount >= 0),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index expenses_date_idx on expenses(date);
create index expenses_owner_idx on expenses(owner);
create index expenses_account_idx on expenses(account_id);

create table incomes (
  id uuid primary key default gen_random_uuid(),
  month text not null, -- 'YYYY-MM'
  name text not null default '',
  amount int not null default 0,
  owner uuid references profiles(id)
);
create index incomes_month_idx on incomes(month);

create table investments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  date date not null,
  name text not null,
  amount int not null check (amount >= 0),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index investments_date_idx on investments(date);
create index investments_owner_idx on investments(owner);

create table custom_categories (
  name text primary key,
  created_at timestamptz not null default now()
);

create table other_counts (
  name text primary key,
  count int not null default 0
);

-- 初期口座 4件（固定id）
insert into accounts (id, name, color, budget, sort) values
  ('a1', '第1口座（生活費）', '#F5A524', 180000, 1),
  ('a2', '第2口座（ローン等）', '#63C7E8', 0, 2),
  ('a3', '第3口座（趣味・娯楽・交際）', '#2FB8A6', 60000, 3),
  ('a4', '第4口座（投資）', '#8B7CF6', 80000, 4);
