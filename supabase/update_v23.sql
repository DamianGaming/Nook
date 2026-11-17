-- Nook v23: group invite previews (the "embed" card shown for invite links). Safe to run more than once.
-- Anyone signed in who holds a valid invite code can see the group's name, picture, description and size,
-- so they can decide whether to join. A wrong code returns nothing, and tries are rate limited.

create or replace function invite_preview(code text)
returns table (group_id uuid, name text, icon_emoji text, icon_url text, banner_url text, description text, accent text, members bigint, is_member boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform hit('invite_preview', 120, interval '1 hour');
  return query
    select g.id, g.name, g.icon_emoji, g.icon_url, g.banner_url, g.description, g.accent,
           (select count(*) from group_members m where m.group_id = g.id),
           exists (select 1 from group_members m where m.group_id = g.id and m.user_id = auth.uid())
    from groups g where g.invite_code = code and char_length(code) between 6 and 40;
end $$;
grant execute on function invite_preview(text) to authenticated;
