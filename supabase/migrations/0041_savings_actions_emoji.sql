-- 節約アクションのカードを折りたたみ表示した際に一目で内容がわかるよう、行動を表す絵文字を追加する。
alter table savings_actions add column if not exists emoji text not null default '💡';
