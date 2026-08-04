-- 写真から自動で分類・登録される個人記録（体組成・ランニング・ボルダリングなど、種類を問わない）。
-- owner毎に完全に独立（ハルキ・アリサで共有しない）。
create table if not exists personal_records (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  category text not null,
  date date not null,
  title text not null default '',
  -- [{"label":"体重","value":"84.1kg"}, ...] 種類ごとに項目が違うため柔軟なjsonbで持つ。
  metrics jsonb not null default '[]'::jsonb,
  memo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists personal_records_owner_category_date_idx on personal_records (owner, category, date desc);
