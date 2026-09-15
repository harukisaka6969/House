-- 支出を登録した時点の初期状態を「2人の支出（共通）」にする（誰のボタンも押していない標準状態）。
-- 第1口座は入力した人と実際の支出主が一致するとは限らないため、誰の支出かは登録後にボタンで
-- 付け替える運用にする（PUT /api/expenses/[id]/owner）。0047時点の定義（original_currency等・
-- table(promoted, ids)戻り値）をベースに、insert先のownerだけnullへ変更する。
create or replace function add_expense_entries(p_owner uuid, p_entries jsonb)
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
      null,
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
