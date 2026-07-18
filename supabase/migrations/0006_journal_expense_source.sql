-- 日記本文からAIで自動抽出した支出を区別するための列。
-- 既定は'manual'（通常の手入力・文章解析・レシートOCR等すべて含む）。日記由来のみ'journal'。
alter table expenses add column if not exists source text not null default 'manual';
