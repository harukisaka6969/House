-- item_history を「品目名だけの検索」から「店名・カテゴリでも検索でき、金額の集計もできる」形に拡張する。
-- store: 購入時のメモ（レシートOCRなら店名になることが多い）。category: 支出のカテゴリ。
-- amount: その品目1件分の金額（レシートから個別に読み取れた場合のみ。読み取れなければnull）。
-- expense_id: 元になったexpensesの行への参照。店名・カテゴリ単位の合計は、個々の品目金額の抜け漏れに
-- 影響されないよう、expense_idを介してexpenses.amountを直接合算する方式にする。
alter table item_history
  add column if not exists store text not null default '',
  add column if not exists category text not null default '',
  add column if not exists amount numeric,
  add column if not exists expense_id uuid references expenses(id) on delete set null;

update item_history set store = note where note is not null and note <> '' and store = '';
alter table item_history drop column if exists note;

create index if not exists item_history_owner_store_idx on item_history (owner, store);
create index if not exists item_history_owner_category_idx on item_history (owner, category);
create index if not exists item_history_expense_idx on item_history (expense_id) where expense_id is not null;

-- 支出の一括登録RPCが、生成した各expenses行のidも返すようにする（品目履歴からexpensesへ正しく
-- 紐づけるために必要）。挙動はpromotedの中身も含めて既存のまま、返り値の形だけ拡張する
-- （戻り値の型自体を変えるため、先に既存の関数を削除する必要がある）。
drop function if exists add_expense_entries(uuid, jsonb);

create function add_expense_entries(p_owner uuid, p_entries jsonb)
returns table(promoted text[], ids uuid[])
language plpgsql
as $$
declare
  entry jsonb;
  cat_val text;
  sub_val text;
  cnt int;
  new_id uuid;
  promoted_list text[] := '{}';
  id_list uuid[] := '{}';
  fixed_categories text[] := array['食費','外食','住居','水道光熱','通信','交通','日用品','ペット','医療','交際費','旅行','投資','趣味','その他'];
begin
  for entry in select * from jsonb_array_elements(p_entries)
  loop
    insert into expenses (owner, date, account_id, category, sub, amount, memo, original_currency, original_amount, exchange_rate)
    values (
      p_owner,
      (entry->>'date')::date,
      entry->>'account_id',
      entry->>'category',
      nullif(trim(entry->>'sub'), ''),
      (entry->>'amount')::int,
      coalesce(entry->>'memo', ''),
      entry->>'original_currency',
      (entry->>'original_amount')::numeric,
      (entry->>'exchange_rate')::numeric
    )
    returning id into new_id;
    id_list := array_append(id_list, new_id);

    cat_val := entry->>'category';
    sub_val := nullif(trim(entry->>'sub'), '');

    if cat_val = 'その他' and sub_val is not null then
      insert into other_counts(name, count) values (sub_val, 1)
      on conflict (name) do update set count = other_counts.count + 1
      returning count into cnt;

      if cnt >= 3
         and not (sub_val = any(fixed_categories))
         and not exists (select 1 from custom_categories where name = sub_val)
      then
        insert into custom_categories(name) values (sub_val) on conflict (name) do nothing;
        update expenses set category = sub_val
          where category = 'その他' and trim(sub) = sub_val;
        promoted_list := array_append(promoted_list, sub_val);
      end if;
    end if;
  end loop;

  return query select promoted_list, id_list;
end;
$$;

-- 既存のバックフィル済み品目履歴（各行がexpenses 1件から1品目として作られたもの）を、
-- 元のexpenses行に紐づけ直す（store/category/amount/expense_idを埋める）。
-- 同じowner・日付・メモの支出が複数ある場合も、作成順で対応付けて誤って二重紐付けしないようにする。
with ih_ranked as (
  select id, owner, date, name,
         row_number() over (partition by owner, date, name order by created_at) as rn
  from item_history
  where source = 'purchase' and expense_id is null
),
exp_ranked as (
  select id, owner, date, memo, category, amount,
         row_number() over (partition by owner, date, memo order by created_at) as rn
  from expenses
)
update item_history ih
set expense_id = e.id,
    amount = e.amount,
    store = e.memo,
    category = e.category
from ih_ranked r
join exp_ranked e on e.owner = r.owner and e.date = r.date and e.memo = r.name and e.rn = r.rn
where ih.id = r.id;
