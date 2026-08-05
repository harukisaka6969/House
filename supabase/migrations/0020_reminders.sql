-- 定期的にやること（ゴミ出し・ペットの薬など）。世帯で共有（owner区別なし）。
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  recurrence_type text not null check (recurrence_type in ('daily', 'weekly', 'monthly')),
  -- weeklyのとき使用: 0=日〜6=土
  day_of_week smallint check (day_of_week between 0 and 6),
  -- monthlyのとき使用: 1〜31（月の日数を超える場合はその月の末日扱い）
  day_of_month smallint check (day_of_month between 1 and 31),
  memo text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists reminders_active_idx on reminders (active);
