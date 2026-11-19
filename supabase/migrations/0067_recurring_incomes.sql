-- 毎月決まって入る収入（給与など）。毎日のcron（/api/cron/recurring-expenses）が、家計の月
-- （25日始まり）が変わったらその月の incomes に1回だけ登録する。last_generated_month で二重登録を防ぐ。
create table if not exists recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  owner uuid references profiles(id) on delete cascade,
  name text not null,
  amount integer not null check (amount > 0),
  active boolean not null default true,
  last_generated_month text,
  created_at timestamptz not null default now()
);

alter table recurring_incomes enable row level security;

-- 遥希の給与（月55万円）。2026-10 までは手で登録済みなので、次の月（2026-11）から自動登録する。
insert into recurring_incomes (owner, name, amount, last_generated_month)
select id, '給与', 550000, '2026-10' from profiles where slug = 'haruki'
and not exists (select 1 from recurring_incomes r join profiles p on p.id = r.owner where p.slug = 'haruki' and r.name = '給与');
