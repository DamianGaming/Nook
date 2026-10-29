-- Nook v19: automatic activity shows the program's real icon, and its start time no longer resets.
--   activity_icon : path of a small icon image in your own media folder, like "<your user id>/activity-ab12cd.png"
--   activity_seen : last time the app confirmed the activity is still going (activity_at stays the start time)
-- Safe to run more than once.
alter table profiles add column if not exists activity_icon text;
alter table profiles add column if not exists activity_seen timestamptz;
alter table profiles drop constraint if exists profiles_activity_icon_check;
alter table profiles add constraint profiles_activity_icon_check
  check (activity_icon is null or activity_icon ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/activity-[a-z0-9]{1,16}\.png$');
