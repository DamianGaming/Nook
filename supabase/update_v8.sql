-- Nook v8: social links on profiles (up to 5 web links). Safe to re-run.
alter table profiles add column if not exists socials jsonb not null default '[]'::jsonb;
alter table profiles drop constraint if exists profiles_socials_check;
alter table profiles add constraint profiles_socials_check
  check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 5 and length(socials::text) <= 1200);
