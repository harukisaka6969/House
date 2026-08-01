-- AIによる日次・週次ダイジェスト（前日のまとめ / 週間まとめ）。owner本人にのみ表示する。
create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  kind text not null check (kind in ('daily', 'weekly')),
  -- daily: 対象日（YYYY-MM-DD）。weekly: 対象週の月曜日（YYYY-MM-DD）。
  period_key text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (owner, kind, period_key)
);

create index if not exists digests_owner_kind_period_idx on digests (owner, kind, period_key desc);
