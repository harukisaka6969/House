-- リマインダーごとに個別のLINE通知時刻（JST "HH:MM"、15分刻み）を設定できるようにする。nullなら個別通知なし。
alter table reminders add column if not exists notify_time text;
alter table reminders add column if not exists last_notified_date date;
