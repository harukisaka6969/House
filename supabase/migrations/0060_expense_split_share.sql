-- 友達と一緒に払った支出を「何人中何人分が自分たちの負担か」で記録できるようにする。
-- 立て替えた全額は split_total_amount に残し、amount には実質負担分（全額×split_num/split_den）を入れる。
-- こうすることで、口座残高・カテゴリ別・グラフなど既存の集計はすべて実質負担額ベースになる。
-- 3カラムともnullなら従来どおり「全額が自分たちの負担」。
alter table expenses
  add column split_num int,
  add column split_den int,
  add column split_total_amount int;
