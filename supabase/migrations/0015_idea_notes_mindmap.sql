-- アイデアボードをマインドマップ化: 座標(x,y)を持たせてドラッグで自由配置できるようにし、
-- メモ同士を線でつなげられるようにする。共有機能: visibility='shared'にするとパートナーも
-- 閲覧・編集・移動・接続できるようになる（デフォルトはprivateで本人のみ）。
alter table idea_notes add column if not exists x numeric not null default 0;
alter table idea_notes add column if not exists y numeric not null default 0;
alter table idea_notes add column if not exists visibility text not null default 'private' check (visibility in ('private', 'shared'));

create table if not exists idea_note_links (
  id uuid primary key default gen_random_uuid(),
  from_note uuid not null references idea_notes(id) on delete cascade,
  to_note uuid not null references idea_notes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idea_note_links_from_idx on idea_note_links (from_note);
create index if not exists idea_note_links_to_idx on idea_note_links (to_note);
