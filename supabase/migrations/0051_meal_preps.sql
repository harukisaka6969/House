-- 作り置き（まとめて作った料理）の登録。総重量と、その総重量ぶんの合計栄養価を持つ。
-- 「何グラム食べたか」を記録するたびに、総量に対する比率で栄養価を按分してmeal_logsに1件積み、
-- remaining_weight_gを減らしていく（登録のたびに毎回カロリーを計算し直す手間を無くすため）。
create table if not exists meal_preps (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  name text not null,
  total_weight_g numeric not null,
  remaining_weight_g numeric not null,
  calories numeric not null,
  protein_g numeric not null,
  fat_g numeric not null,
  carb_g numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists meal_preps_owner_idx on meal_preps (owner, created_at desc);
