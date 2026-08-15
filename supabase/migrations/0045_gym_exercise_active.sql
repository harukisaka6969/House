-- 種目を一時的に非表示にできるようにする（削除ではなく、記録は残したまま一覧から隠す）。
alter table gym_exercises add column if not exists active boolean not null default true;
