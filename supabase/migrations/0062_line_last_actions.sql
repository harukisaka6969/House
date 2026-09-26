-- LINEから最後に登録した内容を1人1件だけ覚えておく（「取り消し」と送ったときに消す対象）。
-- 何を消せばよいかはkindとpayload（作成したレコードのid等）で判断する。
-- 履歴として溜める必要はないため、profileごとに1行をupsertして上書きする。
create table line_last_actions (
  profile_id uuid primary key references profiles(id) on delete cascade,
  -- 'expense' | 'meal' | 'gym'
  kind text not null,
  -- 例: {"expenseIds":["..."]} / {"mealLogIds":["..."],"prepRestore":{"prepId":"...","grams":150}}
  payload jsonb not null default '{}'::jsonb,
  -- 取り消し済みなら、同じ内容を二重に消さないためのフラグ
  undone boolean not null default false,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table line_last_actions enable row level security;
