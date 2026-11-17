-- Nook v18: marks activity that was detected automatically (games, music, calls) so it can be cleared
-- and refreshed on its own, and never replaces an activity you set yourself.
-- Safe to run more than once.
alter table profiles add column if not exists activity_src text;
alter table profiles drop constraint if exists profiles_activity_src_check;
alter table profiles add constraint profiles_activity_src_check check (activity_src is null or activity_src = 'auto');
