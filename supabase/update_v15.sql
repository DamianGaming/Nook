-- Nook v15: activity statuses (Playing, Listening to, Watching...) and unread @mention counts that survive a reload.
-- Safe to run more than once. Run after update_v14.sql.

alter table profiles add column if not exists activity_type text;
alter table profiles add column if not exists activity_name text;
alter table profiles add column if not exists activity_at timestamptz;
alter table profiles drop constraint if exists profiles_activity_type_check;
alter table profiles add constraint profiles_activity_type_check
  check (activity_type is null or activity_type in ('playing', 'listening', 'watching', 'streaming', 'competing', 'building'));
alter table profiles drop constraint if exists profiles_activity_name_check;
alter table profiles add constraint profiles_activity_name_check
  check (activity_name is null or char_length(activity_name) between 1 and 60);

-- How many unread messages in each channel mention you by name (not counting @everyone).
create or replace function mention_counts(uname text) returns table (target_id uuid, mentions bigint)
language sql security definer stable set search_path = public as $$
  select c.id, count(m.id)
  from channels c
  join group_members gm on gm.group_id = c.group_id and gm.user_id = auth.uid()
  left join read_states rs on rs.user_id = auth.uid() and rs.target_id = c.id
  join messages m on m.channel_id = c.id and m.author_id <> auth.uid()
   and m.created_at > coalesce(rs.last_read, gm.joined_at)
   and m.content ~* ('(^|[^a-z0-9_])@' || regexp_replace(uname, '[^a-z0-9_]', '', 'gi') || '([^a-z0-9_]|$)')
  group by c.id
$$;
