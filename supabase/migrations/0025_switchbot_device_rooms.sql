-- 「家電」画面で、SwitchBotデバイスを部屋ごとに表示するための割り当てテーブル。
-- SwitchBotのAPI自体には部屋の概念が無いため、アプリ側で保持する。
create table if not exists switchbot_device_rooms (
  device_id text primary key,
  room text not null,
  created_at timestamptz not null default now()
);
