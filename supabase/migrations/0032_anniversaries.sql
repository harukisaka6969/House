-- 記念日（結婚記念日・誕生日など）。life_eventsと同じく世帯共有・オーナー区分なし。
-- 「今日は何の日」判定はdateの月日部分だけを見て行う（毎年繰り返す前提）。
create table if not exists anniversaries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists anniversaries_date_idx on anniversaries (date);

insert into anniversaries (name, date) values
  ('結婚記念日', '2026-04-25'),
  ('初デート記念日', '2023-08-31'),
  ('アリサ誕生日', '1998-05-30'),
  ('遥希誕生日', '2000-08-08'),
  ('プロポーズ記念日', '2025-01-14');
