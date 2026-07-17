-- 家のインベントリー（消耗品在庫管理）: お米・ペット用品・サプリ等、減っていく物の在庫と低在庫アラート

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'その他',
  unit text not null default '個',
  quantity int not null default 0 check (quantity >= 0),
  low_stock_threshold int not null default 1 check (low_stock_threshold >= 0),
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_category_idx on inventory_items(category);

-- 補充（購入）記録: quantity加算 + 任意で支出登録、を1トランザクションで行う（他のv2機能と同じ二重計上防止パターン）。
create or replace function restock_inventory_item(
  p_item_id uuid,
  p_amount int,
  p_owner uuid,
  p_create_expense boolean,
  p_account_id text,
  p_category text,
  p_price int
) returns int
language plpgsql
as $$
declare
  v_quantity int;
  v_name text;
begin
  update inventory_items set quantity = quantity + p_amount, updated_at = now()
    where id = p_item_id
    returning quantity, name into v_quantity, v_name;
  if not found then
    raise exception 'item not found';
  end if;

  if p_create_expense then
    insert into expenses (owner, date, account_id, category, amount, memo)
    values (p_owner, current_date, p_account_id, p_category, p_price, v_name);
  end if;

  return v_quantity;
end;
$$;
