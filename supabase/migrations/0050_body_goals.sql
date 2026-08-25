-- 体組成の目標（体脂肪率・筋肉量の増減ペース・詳細）。1人1件（upsert）。
-- muscle_trend_kg_per_4w: 「維持」「微増加」のような言葉ではなく、月(4週)あたりの目標変化量(kg)を
-- スライダーで直接指定する（0=維持、正=増加、負=減少）。
create table if not exists body_goals (
  owner uuid primary key references profiles(id) on delete cascade,
  body_fat_pct_target numeric,
  muscle_trend_kg_per_4w numeric,
  target_weight numeric,
  target_lbm numeric,
  target_date date,
  updated_at timestamptz not null default now()
);
