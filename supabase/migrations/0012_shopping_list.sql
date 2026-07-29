-- 買い物リスト（夫婦で共有）。Amazon・その他で買うものはパートナーの承認が必要。
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  name text not null,
  store text not null check (store in ('seiyu', 'amazon', 'conveni', 'other')),
  needs_approval boolean not null default false,
  approved boolean not null default false,
  approved_by uuid references profiles(id),
  bought boolean not null default false,
  bought_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shopping_items_bought_idx on shopping_items (bought);
