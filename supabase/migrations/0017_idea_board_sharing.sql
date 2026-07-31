-- ボード単位の共有プリセット。trueにすると、そのボード内の既存・今後作成する
-- メモがすべて自動的にパートナーと共有された扱いになる（個々のメモのvisibilityとは独立）。
alter table idea_boards add column if not exists shared boolean not null default false;
