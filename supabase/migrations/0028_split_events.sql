-- 「割り勘」機能: 旅行などのイベントに支出を登録し、参加者間で割り勘を計算する。
-- share_tokenを知っている人は誰でも（ハルキ・アリサ以外の同行者も含め）参加者の追加・
-- 支出の登録ができる（リンク共有のみで認証は行わない = 家計簿本体の認証とは別軸）。

create table if not exists split_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id),
  share_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists split_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references split_events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists split_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references split_events(id) on delete cascade,
  payer_id uuid not null references split_participants(id) on delete cascade,
  amount numeric not null check (amount > 0),
  memo text not null default '',
  date date not null,
  created_at timestamptz not null default now()
);

-- 1つの支出につき、誰のために使ったか（1人でも複数でも）。均等割り。
create table if not exists split_expense_shares (
  expense_id uuid not null references split_expenses(id) on delete cascade,
  participant_id uuid not null references split_participants(id) on delete cascade,
  primary key (expense_id, participant_id)
);

create index if not exists split_participants_event_idx on split_participants (event_id);
create index if not exists split_expenses_event_idx on split_expenses (event_id);
create index if not exists split_expense_shares_expense_idx on split_expense_shares (expense_id);
create index if not exists split_expense_shares_participant_idx on split_expense_shares (participant_id);
