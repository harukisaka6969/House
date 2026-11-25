-- LINEで支出の返信の「割り勘」ボタンを押したとき、続けて送られてくる人数（「5」「2/5」）を
-- どの支出に適用するかを覚えておく。1人1件だけ（新しく押したら上書き）。古いものは使わない。
create table if not exists line_pending_splits (
  profile_id uuid primary key references profiles(id) on delete cascade,
  expense_ids uuid[] not null,
  created_at timestamptz not null default now()
);

alter table line_pending_splits enable row level security;
