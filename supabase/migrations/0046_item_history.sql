-- 「いつ何を買った/食べたか」を後から品目名で検索できるようにするための、裏で記録する履歴。
-- レシートOCRで読み取った購入品名、支出のメモ、食事ログの内容などを、既存のexpenses/meal_logsとは
-- 別にこのテーブルにも書き残す（検索専用。expenses/meal_logs自体の表示・機能には影響しない）。
create table if not exists item_history (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  name text not null,
  source text not null check (source in ('purchase', 'meal')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists item_history_owner_name_idx on item_history (owner, name);
create index if not exists item_history_owner_date_idx on item_history (owner, date desc);
