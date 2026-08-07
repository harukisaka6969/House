-- iOSショートカットの位置情報オートメーション（出発/到着）から、外出開始時刻を記録するための最小限のテーブル。
create table if not exists home_presence (
  profile_slug text primary key,
  left_at timestamptz,
  updated_at timestamptz not null default now()
);
