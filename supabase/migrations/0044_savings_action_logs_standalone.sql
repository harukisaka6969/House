-- カードは「次に同じものを選びやすくする」ためのものなので、毎回金額が変わる割引購入は
-- カード化せず、節約履歴（savings_action_logs）にだけ単独の記録として残せるようにする。
alter table savings_action_logs alter column action_id drop not null;
alter table savings_action_logs add column if not exists title text;
alter table savings_action_logs add column if not exists description text;
alter table savings_action_logs add column if not exists reasoning text;
alter table savings_action_logs add column if not exists keywords text[] not null default '{}';
alter table savings_action_logs add column if not exists emoji text;

-- action_idがある（カードに紐づく）場合はtitle等は不要、無い（単独記録）場合はtitle等が必須。
alter table savings_action_logs drop constraint if exists savings_action_logs_standalone_check;
alter table savings_action_logs add constraint savings_action_logs_standalone_check
  check (
    (action_id is not null)
    or (title is not null and description is not null and reasoning is not null and emoji is not null)
  );
