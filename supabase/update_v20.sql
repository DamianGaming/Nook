-- Nook v20: several automatic activities at once (a game, music, streaming, the app you are using, a call).
-- Each entry looks like {"t":"playing","n":"Minecraft","i":"<user id>/activity-ab12.png","s":"2026-10-28T10:00:00Z"}
-- Safe to run more than once.
alter table profiles add column if not exists activities jsonb not null default '[]'::jsonb;
alter table profiles drop constraint if exists profiles_activities_check;
alter table profiles add constraint profiles_activities_check
  check (jsonb_typeof(activities) = 'array' and jsonb_array_length(activities) <= 6 and pg_column_size(activities) < 4000);
-- the app you are using is a new kind of activity
alter table profiles drop constraint if exists profiles_activity_type_check;
alter table profiles add constraint profiles_activity_type_check
  check (activity_type is null or activity_type in ('playing', 'listening', 'watching', 'streaming', 'competing', 'building', 'calling', 'sharing', 'using'));
