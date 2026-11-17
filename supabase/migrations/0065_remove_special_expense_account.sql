-- 第5口座（特別支出）を廃止する。入っていた支出は内容で振り分けてから口座自体を削除する
-- （expenses.account_id は accounts を参照しているため、先に付け替えないと削除できない）。
-- ・プロテイン → 第1口座（食費）
-- ・それ以外（結婚式・新婚旅行・自作PCパーツ・旅行先のホテル等） → 第3口座（カテゴリはそのまま）
update expenses set account_id = 'a1', category = '食費'
where account_id = 'a5' and memo ilike '%protein%';

update expenses set account_id = 'a3' where account_id = 'a5';
update recurring_expenses set account_id = 'a3' where account_id = 'a5';

delete from accounts where id = 'a5';
