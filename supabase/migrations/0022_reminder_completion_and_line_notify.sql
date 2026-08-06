-- リマインダーの「今日の分を完了」トグル用
alter table reminders add column if not exists last_completed_date date;

-- LINE通知の送り先（本人のLINEユーザーID）
alter table profiles add column if not exists line_user_id text;
