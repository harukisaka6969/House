create table if not exists savings_actions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  description text not null,
  title text not null,
  estimated_saving int not null,
  reasoning text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists savings_actions_date_idx on savings_actions (date desc, created_at desc);
