-- ウィッシュリストのアイテムに、登録者本人でなくてもコメントできるようにする。
create table wishlist_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references wishlist_items(id) on delete cascade,
  owner uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index wishlist_comments_item_idx on wishlist_comments(item_id, created_at);
alter table wishlist_comments enable row level security;
