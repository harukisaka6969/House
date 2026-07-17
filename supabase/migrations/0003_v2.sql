-- v2 追加機能: 買いたいものリスト・将来設計・メンテナンス管理・家族アカウント
-- 参照: kakeibowebspec-v2.md

alter table profiles add column role text not null default 'owner' check (role in ('owner', 'family'));

create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other' check (kind in ('car', 'house', 'appliance', 'other')),
  acquired_date date,
  memo text not null default ''
);

create table maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  name text not null,
  interval_months int,
  est_cost int not null default 0,
  next_due date not null,
  memo text not null default '',
  active boolean not null default true,
  visible_to_family boolean not null default true
);
create index maintenance_tasks_asset_idx on maintenance_tasks(asset_id);

create table maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references maintenance_tasks(id) on delete cascade,
  done_date date not null,
  actual_cost int not null default 0,
  memo text not null default '',
  expense_id uuid references expenses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index maintenance_logs_task_idx on maintenance_logs(task_id);

create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  is_private boolean not null default false,
  name text not null,
  category text,
  price int not null check (price >= 0),
  priority int not null default 3,
  target_date date,
  saved int not null default 0,
  monthly_plan int not null default 0,
  url text,
  memo text not null default '',
  status text not null default 'planning' check (status in ('planning', 'saving', 'purchased', 'dropped')),
  purchased_date date,
  purchased_price int,
  visible_to_family boolean not null default true,
  created_at timestamptz not null default now()
);
create index wishlist_items_owner_idx on wishlist_items(owner);

create table life_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_year int not null,
  event_month int,
  cost_low int not null default 0,
  cost_high int not null default 0,
  cost_basis text not null default '',
  funded int not null default 0,
  monthly_saving int not null default 0,
  linked boolean not null default true,
  memo text not null default '',
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  visible_to_family boolean not null default true,
  created_at timestamptz not null default now()
);

-- シードデータ例（プレースホルダ。実値はユーザーが編集する前提 — spec §9備考）
insert into life_events (name, event_year, cost_low, cost_high, cost_basis, memo) values
  ('家の建て替え', extract(year from now())::int + 5, 18000000, 22000000, '概算（要見直し）', '仮の見積もりです。編集してください。'),
  ('出産・育児初期費用', extract(year from now())::int + 1, 800000, 1200000, '一般的な目安', '仮の見積もりです。編集してください。'),
  ('教育費（大学まで）', extract(year from now())::int + 18, 8000000, 12000000, '文科省統計目安', '仮の見積もりです。編集してください。');

-- メンテタスク完了: ログ記録 + next_due繰り越し(or単発なら非活性化) + 任意で支出登録、を1トランザクションで行う。
create or replace function complete_maintenance_task(
  p_task_id uuid,
  p_done_date date,
  p_actual_cost int,
  p_memo text,
  p_owner uuid,
  p_create_expense boolean,
  p_account_id text,
  p_category text
) returns uuid
language plpgsql
as $$
declare
  v_interval int;
  v_task_name text;
  v_expense_id uuid;
  v_log_id uuid;
begin
  select interval_months, name into v_interval, v_task_name from maintenance_tasks where id = p_task_id;
  if not found then
    raise exception 'task not found';
  end if;

  if p_create_expense then
    insert into expenses (owner, date, account_id, category, amount, memo)
    values (p_owner, p_done_date, p_account_id, p_category, p_actual_cost, coalesce(nullif(trim(p_memo), ''), v_task_name))
    returning id into v_expense_id;
  end if;

  insert into maintenance_logs (task_id, done_date, actual_cost, memo, expense_id)
  values (p_task_id, p_done_date, p_actual_cost, coalesce(p_memo, ''), v_expense_id)
  returning id into v_log_id;

  if v_interval is not null then
    update maintenance_tasks set next_due = (p_done_date + (v_interval || ' months')::interval)::date where id = p_task_id;
  else
    update maintenance_tasks set active = false where id = p_task_id;
  end if;

  return v_log_id;
end;
$$;

-- ウィッシュ購入処理: statusをpurchasedに + 任意で支出登録、を1トランザクションで行う。
create or replace function purchase_wishlist_item(
  p_item_id uuid,
  p_purchased_date date,
  p_purchased_price int,
  p_owner uuid,
  p_create_expense boolean,
  p_account_id text,
  p_category text
) returns void
language plpgsql
as $$
declare
  v_name text;
begin
  update wishlist_items
    set status = 'purchased', purchased_date = p_purchased_date, purchased_price = p_purchased_price
    where id = p_item_id and owner = p_owner
    returning name into v_name;
  if not found then
    raise exception 'item not found';
  end if;

  if p_create_expense then
    insert into expenses (owner, date, account_id, category, amount, memo)
    values (p_owner, p_purchased_date, p_account_id, p_category, p_purchased_price, v_name);
  end if;
end;
$$;

-- ウィッシュ積立記録: savedを加算 + 任意で支出登録、を1トランザクションで行う。
create or replace function contribute_wishlist_item(
  p_item_id uuid,
  p_amount int,
  p_owner uuid,
  p_create_expense boolean,
  p_account_id text,
  p_category text
) returns int
language plpgsql
as $$
declare
  v_saved int;
  v_name text;
begin
  update wishlist_items set saved = saved + p_amount where id = p_item_id and owner = p_owner
    returning saved, name into v_saved, v_name;
  if not found then
    raise exception 'item not found';
  end if;

  if p_create_expense then
    insert into expenses (owner, date, account_id, category, amount, memo)
    values (p_owner, current_date, p_account_id, p_category, p_amount, '積立: ' || v_name);
  end if;

  return v_saved;
end;
$$;

-- ライフイベント積立記録: fundedを加算する（支出連携なし。世帯共有のため所有者概念がない）。
create or replace function contribute_life_event(p_event_id uuid, p_amount int) returns int
language plpgsql
as $$
declare
  v_funded int;
begin
  update life_events set funded = funded + p_amount where id = p_event_id
    returning funded into v_funded;
  if not found then
    raise exception 'event not found';
  end if;
  return v_funded;
end;
$$;
