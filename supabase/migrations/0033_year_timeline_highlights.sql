-- 年間タイムライン機能: 日記からAIが抽出した「その年の大きな出来事」を年ごとにキャッシュする。
-- 日記は本人のみ閲覧可（journal_entries参照）のため、これも本人分のみ・非公開。
create table if not exists year_timeline_highlights (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  year int not null,
  items jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  unique (owner, year)
);
