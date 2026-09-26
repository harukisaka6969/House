-- 何で支払ったか（共用カード・アリサEPOS・PayPay・現金など）。
-- レシートのカード下4桁や決済サービス名から判定して入れるが、読み取れないことも多いため
-- nullを許容し、あとからアプリ・LINEで設定できるようにする。
alter table expenses add column payment_method text;
create index expenses_payment_method_idx on expenses(payment_method) where payment_method is not null;
