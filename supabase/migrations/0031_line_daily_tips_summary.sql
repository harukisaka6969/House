-- 生活tipsの「同じ内容を繰り返さない」判定を、直近10日だけでなく実質無期限に広げるため、
-- 各回のテーマを一言で要約したsummaryも保存する（本文全部より軽いので、古い分もまとめて渡せる）。
alter table line_daily_tips add column if not exists summary text not null default '';
