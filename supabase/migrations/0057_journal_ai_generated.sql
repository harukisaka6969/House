-- AIの自動下書きを一切編集せず保存しただけの日記かどうか。振り返りカレンダーの赤丸（自分で書いた
-- 日だけの印）から除外するために使う。
alter table journal_entries add column ai_generated boolean not null default false;
