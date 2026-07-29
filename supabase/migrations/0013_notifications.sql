-- アプリアイコンのバッジ通知用。「いつ見たか」をユーザーごとに記録し、それ以降の新着を数える。
alter table shopping_items add column if not exists approved_at timestamptz;

create table if not exists notification_reads (
  owner uuid primary key references profiles(id) on delete cascade,
  shopping_seen_at timestamptz not null default now(),
  meals_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
