-- 日記・スポーツ記録: どの日に何をやったか、その日の運動記録。世帯で共有（相手の記録も閲覧可、編集は本人のみ）。

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  date date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, date)
);
create index journal_entries_date_idx on journal_entries(date);

create table sport_logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id),
  date date not null,
  activity text not null,
  duration_minutes int,
  distance_km real,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index sport_logs_owner_date_idx on sport_logs(owner, date);
