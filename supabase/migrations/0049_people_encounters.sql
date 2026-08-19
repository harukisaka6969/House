-- 「奥田と前回会ったのはいつ？」のような質問に答えられるようにするための、人物の名寄せ台帳と、
-- 日記から抽出した「いつ誰と何をしたか」の記録。
-- people/person_aliases は世帯で共有する連絡先台帳（表記ゆれの名寄せ専用）。
-- journal_encounters は日記本文からAIが抽出した1日1人分の記録で、日記本文と同様に本人にしか見えない
-- （ownerで厳密にスコープする。expensesのような世帯共有ではない）。
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  reading text,
  memo text not null default '',
  created_at timestamptz not null default now()
);

-- 1つの表記（本名・ニックネームいずれも）は必ずただ1人の人物にしか紐づかない。これにより
-- 日記抽出時の名寄せが「表記 → person_id」の単純な引き当てで確定的に行える。
-- canonical_nameを登録する際も、必ず自分自身をこのテーブルにエイリアスとして追加する。
create table if not exists person_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists person_aliases_alias_key on person_aliases (lower(alias));
create index if not exists person_aliases_person_idx on person_aliases (person_id);

create table if not exists journal_encounters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  date date not null,
  -- 表記がpeople台帳のどのエイリアスとも一致しなければnull（person_raw_nameだけが残る。
  -- 後からその人物を登録して日記を再抽出すれば、次回はperson_idが埋まる）。
  person_id uuid references people(id) on delete set null,
  person_raw_name text not null,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists journal_encounters_owner_date_idx on journal_encounters (owner, date desc);
create index if not exists journal_encounters_person_idx on journal_encounters (person_id, date desc);
