-- 有酸素種目対応: 種目に種別（筋トレ/有酸素）を持たせ、有酸素の記録は時間・距離で残せるようにする。
alter table gym_exercises add column if not exists type text not null default 'strength' check (type in ('strength', 'cardio'));
alter table gym_logs add column if not exists duration_minutes numeric;
alter table gym_logs add column if not exists distance_km numeric;
