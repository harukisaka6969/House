-- リマインダーに「実行者」（任意）を設定できるようにする。
alter table reminders add column if not exists assigned_to uuid references profiles(id);
