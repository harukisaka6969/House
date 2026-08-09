-- LINEに1日5回送る「生活tips」の送信履歴。同じ日に同じカテゴリを二重送信しないための冪等性チェックと、
-- 直近の内容をAIに渡して「毎日違う内容」を維持するために使う。
create table if not exists line_daily_tips (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('news', 'health', 'money', 'philosophy', 'wellbeing')),
  date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (category, date)
);

create index if not exists line_daily_tips_category_date_idx on line_daily_tips (category, date desc);
