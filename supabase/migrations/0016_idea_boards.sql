-- アイデアボードを複数持てるようにし（1つのマインドマップに詰め込みすぎないため）、
-- メモにタイトルを追加する。共有メモは特定のボードに紐付けず、別途「共有」ビューで集約表示する。
create table if not exists idea_boards (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idea_boards_owner_idx on idea_boards (owner, created_at);

alter table idea_notes add column if not exists title text not null default '';
alter table idea_notes add column if not exists board_id uuid references idea_boards(id) on delete cascade;

-- 既存メモ（あれば）を持ち主ごとのデフォルトボードに割り当てる。
do $$
declare
  r record;
  new_board_id uuid;
begin
  for r in select distinct owner from idea_notes where board_id is null loop
    insert into idea_boards (owner, name) values (r.owner, 'ボード1') returning id into new_board_id;
    update idea_notes set board_id = new_board_id where owner = r.owner and board_id is null;
  end loop;
end $$;

alter table idea_notes alter column board_id set not null;
create index if not exists idea_notes_board_idx on idea_notes (board_id);
