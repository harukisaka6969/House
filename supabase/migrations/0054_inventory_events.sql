-- 在庫の増減履歴（何をいつ何個買った/使ったか）。消費ペース・在庫切れ見込みの算出に使う。
create table inventory_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  kind text not null check (kind in ('restock', 'consume')),
  amount int not null check (amount > 0),
  date date not null default current_date,
  price int,
  expense_id uuid references expenses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_events_item_idx on inventory_events(item_id, date);
alter table inventory_events enable row level security;

-- 旧シグネチャ(7引数)をそのまま残すと、新シグネチャ(8引数、p_dateがdefault付き)とオーバーロードし、
-- p_date省略時の呼び出しが曖昧になってエラーになるため先に削除しておく。
drop function if exists restock_inventory_item(uuid, int, uuid, boolean, text, text, int);

-- restock_inventory_item: 購入日(p_date、省略時は今日)を受け取れるように拡張し、履歴も同じトランザクションで記録する。
create or replace function restock_inventory_item(
  p_item_id uuid,
  p_amount int,
  p_owner uuid,
  p_create_expense boolean,
  p_account_id text,
  p_category text,
  p_price int,
  p_date date default current_date
) returns int
language plpgsql
as $$
declare
  v_quantity int;
  v_name text;
  v_expense_id uuid;
begin
  update inventory_items set quantity = quantity + p_amount, updated_at = now()
    where id = p_item_id
    returning quantity, name into v_quantity, v_name;
  if not found then
    raise exception 'item not found';
  end if;

  if p_create_expense then
    insert into expenses (owner, date, account_id, category, amount, memo)
    values (p_owner, p_date, p_account_id, p_category, p_price, v_name)
    returning id into v_expense_id;
  end if;

  insert into inventory_events (item_id, kind, amount, date, price, expense_id)
  values (p_item_id, 'restock', p_amount, p_date, case when p_create_expense then p_price else null end, v_expense_id);

  return v_quantity;
end;
$$;

-- consume_inventory_item: 消費もrestockと同じく、数量更新と履歴記録を1トランザクションで行う。
create or replace function consume_inventory_item(
  p_item_id uuid,
  p_amount int,
  p_date date default current_date
) returns int
language plpgsql
as $$
declare
  v_quantity int;
begin
  update inventory_items
    set quantity = greatest(quantity - p_amount, 0),
        updated_at = now()
    where id = p_item_id
    returning quantity into v_quantity;
  if not found then
    raise exception 'item not found';
  end if;

  insert into inventory_events (item_id, kind, amount, date)
  values (p_item_id, 'consume', p_amount, p_date);

  return v_quantity;
end;
$$;
