-- 前回の到着時刻。到着時に、iPhoneに残った古い出発時刻（出発のショートカットが動かなかった日の前回分）を
-- 今回の外出と取り違えないよう、これより前の出発時刻は使わない。
alter table home_presence add column if not exists arrived_at timestamptz;
