-- 支出の「誰の支出か」タグを入力後にも変更できるようにする。ownerがnullは「2人の支出（共通）」を表す。
alter table expenses alter column owner drop not null;
