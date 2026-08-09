-- 年間タイムラインの支出クラスタ（例: 北海道旅行にまとめた一式）に付けたAI見出しをキャッシュする。
alter table year_timeline_highlights add column if not exists expense_clusters jsonb not null default '[]'::jsonb;
