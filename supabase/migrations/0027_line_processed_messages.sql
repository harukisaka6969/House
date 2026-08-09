-- LINEのWebhookは同じメッセージを複数回配信し得る（タイムアウト時の再送など）。
-- message_idを一度処理したら記録しておき、二重処理（レシート・支出の重複登録など）を防ぐ。
create table if not exists line_processed_messages (
  message_id text primary key,
  processed_at timestamptz not null default now()
);

-- 古いレコードを無限に溜め込まないよう、7日以上前のものは掃除用に検索しやすくしておく。
create index if not exists line_processed_messages_processed_at_idx on line_processed_messages (processed_at);
