-- 節約アクションの「カード」と「実施履歴」を分離する。
-- 同じ習慣を繰り返し記録しても savings_actions（カード）は増やさず、
-- savings_action_logs（履歴）にだけ実施記録を積み重ねる。
create table if not exists savings_action_logs (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references savings_actions(id) on delete cascade,
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  estimated_saving int not null,
  created_at timestamptz not null default now()
);

create index if not exists savings_action_logs_action_idx on savings_action_logs (action_id, date desc);
create index if not exists savings_action_logs_date_idx on savings_action_logs (date desc, created_at desc);

-- 既存データの移行: まず全カードを、自分自身の初回実施履歴として複製する。
insert into savings_action_logs (action_id, owner, date, estimated_saving, created_at)
select id, owner, date, estimated_saving, created_at from savings_actions;

-- 同じ(title, description)を持つ重複カード（従来は繰り返し登録のたびに新規作成されていた）を、
-- 最も古い1件（canonical）に統合する。重複カードの履歴はcanonical側の履歴として付け替える。
with ranked as (
  select id, title, description,
         first_value(id) over (partition by title, description order by created_at asc, id asc) as canonical_id
  from savings_actions
),
dupes as (
  select id, canonical_id from ranked where id <> canonical_id
)
update savings_action_logs sl
set action_id = d.canonical_id
from dupes d
where sl.action_id = d.id;

delete from savings_actions sa
using (
  select id, title, description,
         first_value(id) over (partition by title, description order by created_at asc, id asc) as canonical_id
  from savings_actions
) r
where sa.id = r.id and r.id <> r.canonical_id;
