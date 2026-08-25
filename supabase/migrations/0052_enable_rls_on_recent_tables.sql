-- このセッションで新設した各テーブルに、他の既存テーブルと同様にRLSを有効化する（ポリシーは追加しない
-- ——アプリはservice roleキーでのみDBにアクセスし、RLSは常にバイパスされる。anonキーはクライアントに
-- 一切渡していないためRLSポリシー自体は不要だが、Supabaseのセキュリティ監査で「RLS未有効化」として
-- 検出されるのを防ぐため、他のテーブルに揃えて有効化だけしておく）。
alter table savings_action_logs enable row level security;
alter table people enable row level security;
alter table person_aliases enable row level security;
alter table item_history enable row level security;
alter table journal_encounters enable row level security;
alter table body_goals enable row level security;
alter table meal_preps enable row level security;
