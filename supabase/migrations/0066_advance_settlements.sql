-- 立替の清算記録。エポスカードの請求サイクル（締め日の属する月 "YYYY-MM"）ごとに1行。
-- 行があれば清算済み。清算したときの金額（人ごとの合計）をスナップショットとして残し、
-- 後から立替の付け替えがあっても「いくら清算したか」が分かるようにする。
create table if not exists advance_settlements (
  cycle_key text primary key,
  settled_at timestamptz not null default now(),
  settled_by uuid references profiles(id) on delete set null,
  -- 例: {"<profile id>": 12345, "<profile id>": 6789}
  amounts jsonb not null default '{}'::jsonb
);

alter table advance_settlements enable row level security;
