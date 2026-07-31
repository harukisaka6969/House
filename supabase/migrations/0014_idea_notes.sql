-- アイデアボード: 思いついたことのメモ・ブレインストーム・写真を自由に残す（本人のみ閲覧可、日記に近い私的な機能）。
create table if not exists idea_notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  content text not null default '',
  photo_data_url text,
  color text not null default 'yellow' check (color in ('yellow', 'blue', 'green', 'pink', 'purple')),
  created_at timestamptz not null default now()
);

create index if not exists idea_notes_owner_idx on idea_notes (owner, created_at desc);
