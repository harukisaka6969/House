alter table profiles
  add column if not exists auth_method text not null default 'pin' check (auth_method in ('pin', 'pattern'));
