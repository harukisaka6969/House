-- 家の用事リマインダー・在庫切れLINEダイジェストを送る時刻（JST、15分刻み "HH:MM"）。nullなら送らない。
alter table profiles add column if not exists line_reminder_time text;
alter table profiles add column if not exists line_reminder_last_sent_date date;
