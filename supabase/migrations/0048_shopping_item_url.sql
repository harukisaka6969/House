-- 買い物リストの品目に、任意で商品リンク（Amazon等）を添えられるようにする。
alter table shopping_items add column if not exists url text;
