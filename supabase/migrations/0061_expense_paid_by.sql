-- 「どの口座の支出か（account_id）」とは別に、「実際に誰の財布から出たか」を持たせる。
-- 例: 第3口座から払うべきものをアリサが自分のカードで立て替えた場合、account_id='a3' のまま
-- paid_by=アリサ になる。支出自体の金額・口座・集計は変わらず、立替残高の把握だけに使う。
-- nullは通常（その口座から直接支払った）。
alter table expenses add column paid_by uuid references profiles(id);
create index expenses_paid_by_idx on expenses(paid_by) where paid_by is not null;
