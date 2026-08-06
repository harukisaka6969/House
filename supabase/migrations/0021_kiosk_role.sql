-- 共用ダッシュボード（iPad等の常設表示）専用の閲覧用ロールを追加。
-- 個々のowner/family権限とは別で、/api/kiosk 以外には一切アクセスできない。
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('owner', 'family', 'kiosk'));
