-- 筋トレログ: 分割（スプリット）ごとの種目リストと、セッションごとの実施記録。
create table if not exists gym_splits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  code text not null,
  label text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists gym_exercises (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references gym_splits(id) on delete cascade,
  owner uuid not null references profiles(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- setsは [{"weight":35,"reps":10}, ...] の配列。自重種目はweight=0。
create table if not exists gym_logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references gym_exercises(id) on delete cascade,
  date date not null,
  sets jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists gym_exercises_split_idx on gym_exercises (split_id);
create index if not exists gym_logs_exercise_date_idx on gym_logs (exercise_id, date desc);
create index if not exists gym_logs_owner_date_idx on gym_logs (owner, date);
