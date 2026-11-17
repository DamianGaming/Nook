-- Nook v16: automatic activity (in a call / sharing screen) with an on/off switch.
-- Safe to run more than once.
alter table profiles add column if not exists activity_auto boolean not null default true;
alter table profiles drop constraint if exists profiles_activity_type_check;
alter table profiles add constraint profiles_activity_type_check
  check (activity_type is null or activity_type in ('playing', 'listening', 'watching', 'streaming', 'competing', 'building', 'calling', 'sharing'));
