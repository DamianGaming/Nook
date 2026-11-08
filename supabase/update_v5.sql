-- Nook v5: voice channel roster stays correct when a browser tab is in the background.
-- Safe to re-run.
create or replace function voice_roster(cids uuid[]) returns table (channel_id uuid, user_id uuid)
language sql security definer stable set search_path = public as $$
  select v.channel_id, v.user_id
  from voice_members v
  where v.channel_id = any(cids)
    and v.updated_at > now() - interval '120 seconds'
    and is_group_member(channel_group(v.channel_id))
$$;
