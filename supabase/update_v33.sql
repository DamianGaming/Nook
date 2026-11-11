-- Update 33: bots cannot be friends; more staff controls for people, groups and bots.
-- Safe to run more than once. Run it in the Supabase SQL editor after update_v32.sql.

-- ───────────── Bots are not friends ─────────────
create or replace function send_friend_request(uname text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid; f friendships; a uuid; b uuid;
begin
  select id into target from profiles where username = lower(trim(uname));
  if target is null then raise exception 'No one with that username'; end if;
  if target = auth.uid() then raise exception 'That is you'; end if;
  if exists (select 1 from profiles where id = target and is_bot) then raise exception 'Bots cannot be added as friends. Add them to a group to use them.'; end if;
  if is_blocked_between(auth.uid(), target) then raise exception 'You cannot add this person'; end if;
  select * into f from friendships
    where least(requester, addressee) = least(auth.uid(), target) and greatest(requester, addressee) = greatest(auth.uid(), target);
  if found then
    if f.status = 'accepted' then return 'already'; end if;
    if f.requester = auth.uid() then return 'pending'; end if;
    update friendships set status = 'accepted' where id = f.id;
    a := least(auth.uid(), target); b := greatest(auth.uid(), target);
    if not exists (select 1 from dms where user_a = a and user_b = b) then insert into dms(user_a, user_b) values (a, b); end if;
    return 'accepted';
  end if;
  insert into friendships(requester, addressee) values (auth.uid(), target);
  return 'sent';
end $$;

create or replace function friendships_no_bots() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id in (new.requester, new.addressee) and is_bot) then
    raise exception 'Bots cannot be added as friends. Add them to a group to use them.';
  end if;
  return new;
end $$;
drop trigger if exists friendships_no_bots on friendships;
create trigger friendships_no_bots before insert on friendships for each row execute function friendships_no_bots();
delete from friendships f where exists (select 1 from profiles p where p.id in (f.requester, f.addressee) and p.is_bot);

-- ───────────── Time-outs for people, freezing for groups ─────────────
alter table profiles add column if not exists muted_until timestamptz;
alter table groups add column if not exists frozen_at timestamptz;

-- muted_until is staff-only, like badges and suspensions.
create or replace function protect_badges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('nook.admin', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.badges := '{}'; new.banned_at := null; new.ban_reason := null; new.muted_until := null;
    else
      new.badges := old.badges; new.banned_at := old.banned_at; new.ban_reason := old.ban_reason; new.muted_until := old.muted_until;
    end if;
  end if;
  return new;
end $$;

create or replace function enforce_mute_freeze() returns trigger
language plpgsql security definer set search_path = public as $$
declare staff boolean; until_ timestamptz; frozen timestamptz;
begin
  select 'staff' = any(badges), muted_until into staff, until_ from profiles where id = new.author_id;
  if coalesce(staff, false) then return new; end if;
  if until_ is not null and until_ > now() then raise exception 'You are in a time-out until %. You can read but not post.', to_char(until_ at time zone 'utc', 'HH24:MI "UTC" DD Mon'); end if;
  if new.channel_id is not null then
    select g.frozen_at into frozen from channels c join groups g on g.id = c.group_id where c.id = new.channel_id;
    if frozen is not null then raise exception 'This group has been frozen by staff. Messages are paused.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_mute_freeze on messages;
create trigger messages_mute_freeze before insert on messages for each row execute function enforce_mute_freeze();

create or replace function admin_set_mute(uid uuid, minutes int, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  if uid = auth.uid() then raise exception 'You cannot time yourself out'; end if;
  if exists (select 1 from profiles where id = uid and 'staff' = any(badges)) then raise exception 'Staff accounts cannot be timed out'; end if;
  if minutes < 0 or minutes > 60 * 24 * 28 then raise exception 'Choose between 0 minutes and 28 days'; end if;
  perform set_config('nook.admin', '1', true);
  update profiles set muted_until = case when minutes > 0 then now() + make_interval(mins => minutes) end where id = uid;
  perform log_admin(case when minutes > 0 then 'mute_user' else 'unmute_user' end, uid::text, coalesce(minutes::text || ' min', '') || ' · ' || coalesce(why, ''));
end $$;

create or replace function admin_set_group_frozen(gid uuid, on_ boolean, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  update groups set frozen_at = case when on_ then now() end where id = gid;
  if not found then raise exception 'That group does not exist'; end if;
  perform log_admin(case when on_ then 'freeze_group' else 'unfreeze_group' end, gid::text, why);
end $$;

-- Who is in a group, and removing someone (not the founder).
create or replace function admin_group_members(gid uuid) returns table (user_id uuid, username text, display_name text, role text, is_bot boolean, joined timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query select m.user_id, p.username, p.display_name, m.role::text, p.is_bot, m.joined_at
    from group_members m join profiles p on p.id = m.user_id where m.group_id = gid
    order by (m.role::text = 'founder') desc, p.is_bot, p.username limit 200;
end $$;

create or replace function admin_remove_member(gid uuid, uid uuid, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  if exists (select 1 from group_members where group_id = gid and user_id = uid and role::text = 'founder') then raise exception 'Remove the group instead, or ask the founder to hand it over'; end if;
  delete from group_members where group_id = gid and user_id = uid;
  if not found then raise exception 'They are not in that group'; end if;
  perform log_admin('remove_member', gid::text || ':' || uid::text, why);
end $$;

-- Cut a bot off: its token stops working until the owner makes a new one in the developer portal.
create or replace function admin_revoke_bot_token(bid uuid, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  update bots set token_hash = bot_hash(bot_new_token()) where id = bid;
  if not found then raise exception 'That is not a bot'; end if;
  perform log_admin('revoke_bot_token', bid::text, why);
end $$;

-- Lists gain the new fields.
drop function if exists admin_find_users(text);
create or replace function admin_find_users(q text) returns table (id uuid, username text, display_name text, created_at timestamptz,
  badges text[], banned_at timestamptz, ban_reason text, reports_against bigint, muted_until timestamptz, is_bot boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select p.id, p.username, p.display_name, p.created_at, p.badges, p.banned_at, p.ban_reason,
           (select count(*) from reports r where r.reported_user = p.id), p.muted_until, p.is_bot
    from profiles p
    where p.username ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or p.display_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or p.id::text = q
    order by p.created_at desc limit 25;
end $$;

drop function if exists admin_find_groups(text);
create or replace function admin_find_groups(q text) returns table (id uuid, name text, created_at timestamptz, members bigint, channels bigint, founder text, frozen_at timestamptz, bots bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select g.id, g.name, g.created_at,
           (select count(*) from group_members m where m.group_id = g.id),
           (select count(*) from channels c where c.group_id = g.id),
           (select p.username from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id and m.role::text = 'founder' limit 1),
           g.frozen_at,
           (select count(*) from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id and p.is_bot)
    from groups g
    where q = '' or g.name ilike '%' || replace(q, '%', '') || '%' or g.id::text = q
    order by g.created_at desc limit 30;
end $$;

grant execute on function admin_set_mute(uuid, int, text), admin_set_group_frozen(uuid, boolean, text), admin_group_members(uuid), admin_remove_member(uuid, uuid, text),
  admin_revoke_bot_token(uuid, text), admin_find_users(text), admin_find_groups(text) to authenticated;
revoke execute on function admin_set_mute(uuid, int, text), admin_set_group_frozen(uuid, boolean, text), admin_group_members(uuid), admin_remove_member(uuid, uuid, text),
  admin_revoke_bot_token(uuid, text), admin_find_users(text), admin_find_groups(text) from anon;
revoke all on function friendships_no_bots(), enforce_mute_freeze() from public;
