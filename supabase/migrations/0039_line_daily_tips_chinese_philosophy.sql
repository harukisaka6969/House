-- LINEの1日の生活tipsに「東洋の智恵」枠（易学・儒教・道教など古代中国の哲学思想）を追加するため、
-- line_daily_tips.category の許可値に 'chinese_philosophy' を加える。
-- 制約名を決め打ちせず、category列に掛かっているCHECK制約を動的に見つけて張り替える（安全に再実行可能）。
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'line_daily_tips'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table line_daily_tips drop constraint %I', con.conname);
  end loop;
end $$;

alter table line_daily_tips add constraint line_daily_tips_category_check
  check (category in ('news', 'health', 'money', 'philosophy', 'wellbeing', 'chinese_philosophy'));
