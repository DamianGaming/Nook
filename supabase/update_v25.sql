-- Nook v25: much more for bots (history, members, moderation, pins, presence, storage, events),
-- and removes the short-lived voice rooms from v24. Safe to run more than once. Run after update_v24.sql.

-- ───────────────────────── Voice rooms are gone ─────────────────────────
alter table group_voice drop column if exists room_id;
drop table if exists voice_rooms cascade;
drop function if exists limit_voice_rooms();
drop function if exists group_voice_roster(uuid[]);
create or replace function group_voice_roster(gids uuid[]) returns table (group_id uuid, user_id uuid)
language sql security definer stable set search_path = public as $$
  select v.group_id, v.user_id
  from group_voice v
  where v.group_id = any(gids)
    and v.updated_at > now() - interval '120 seconds'
    and is_group_member(v.group_id)
$$;
grant execute on function group_voice_roster(uuid[]) to authenticated;

-- ───────────────────────── Bot helpers ─────────────────────────
-- A bot's power inside a group is whatever the founder gave it in Group settings > Members (the same permissions
-- people have: channels, messages, emoji, invites, members, customize). No permission, no power.
alter table reactions add column if not exists created_at timestamptz not null default now();
create index if not exists reactions_created_idx on reactions (created_at);
create index if not exists messages_edited_idx on messages (edited_at) where edited_at is not null;
create index if not exists group_members_joined_idx on group_members (joined_at);

-- Lets the existing, audited moderation functions run as the bot for the rest of this request.
create or replace function bot_act(bid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', bid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', bid::text, 'role', 'authenticated')::text, true);
end $$;
revoke all on function bot_act(uuid) from public, anon, authenticated;

create or replace function bot_in_group(bid uuid, gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = bid)
$$;
revoke all on function bot_in_group(uuid, uuid) from public, anon, authenticated;

create or replace function bot_can(bid uuid, gid uuid, p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = bid and (role = 'founder' or p = any(perms)))
$$;
revoke all on function bot_can(uuid, uuid, text) from public, anon, authenticated;

-- ───────────────────────── Richer "who am I" ─────────────────────────
create or replace function bot_me(token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'me', 120, interval '1 minute');
  return jsonb_build_object(
    'now', now(),
    'id', bid,
    'username', (select username from profiles where id = bid),
    'name', (select display_name from profiles where id = bid),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'description', g.description,
        'members', (select count(*) from group_members x where x.group_id = g.id),
        'perms', to_jsonb(m.perms),
        'channels', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'topic', c.topic, 'category', (select cat.name from categories cat where cat.id = c.category_id)) order by c.position) from channels c where c.group_id = g.id), '[]'::jsonb)))
      from group_members m join groups g on g.id = m.group_id where m.user_id = bid), '[]'::jsonb));
end $$;

-- ───────────────────────── Everything that happens, in one feed ─────────────────────────
-- type: message | edit | reaction | member_join. Ask again with the newest "at" you saw.
create or replace function bot_events2(token text, after timestamptz, lim int default 100)
returns table (type text, at timestamptz, group_id uuid, group_name text, channel_id uuid, channel_name text, message_id uuid, user_id uuid, username text, display_name text, is_bot boolean, content text, reply_to uuid, kind text, mentioned boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare bid uuid := bot_auth(token); uname text;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'events', 240, interval '1 minute');
  if after is null then return; end if;
  select p0.username into uname from profiles p0 where p0.id = bid;
  return query
  select * from (
    select 'message'::text, m.created_at, c.group_id, g.name, m.channel_id, c.name, m.id, m.author_id, p.username, p.display_name, p.is_bot, m.content, m.reply_to, null::text,
           (m.content ilike '%@' || uname || '%' or exists (select 1 from messages r where r.id = m.reply_to and r.author_id = bid))
    from messages m join channels c on c.id = m.channel_id join groups g on g.id = c.group_id join profiles p on p.id = m.author_id
    where m.created_at > after and m.author_id <> bid and c.group_id in (select gm.group_id from group_members gm where gm.user_id = bid)
    union all
    select 'edit'::text, m.edited_at, c.group_id, g.name, m.channel_id, c.name, m.id, m.author_id, p.username, p.display_name, p.is_bot, m.content, m.reply_to, null::text, false
    from messages m join channels c on c.id = m.channel_id join groups g on g.id = c.group_id join profiles p on p.id = m.author_id
    where m.edited_at > after and m.created_at < m.edited_at and m.author_id <> bid and c.group_id in (select gm.group_id from group_members gm where gm.user_id = bid)
    union all
    select 'reaction'::text, r.created_at, c.group_id, g.name, m.channel_id, c.name, m.id, r.user_id, p.username, p.display_name, p.is_bot, m.content, m.reply_to, r.kind, false
    from reactions r join messages m on m.id = r.message_id join channels c on c.id = m.channel_id join groups g on g.id = c.group_id join profiles p on p.id = r.user_id
    where r.created_at > after and r.user_id <> bid and c.group_id in (select gm.group_id from group_members gm where gm.user_id = bid)
    union all
    select 'member_join'::text, gm.joined_at, gm.group_id, g.name, null::uuid, null::text, null::uuid, gm.user_id, p.username, p.display_name, p.is_bot, null::text, null::uuid, null::text, false
    from group_members gm join groups g on g.id = gm.group_id join profiles p on p.id = gm.user_id
    where gm.joined_at > after and gm.user_id <> bid and gm.group_id in (select gm2.group_id from group_members gm2 where gm2.user_id = bid)
  ) e order by 2 asc limit least(greatest(coalesce(lim, 100), 1), 200);
end $$;

-- ───────────────────────── Reading ─────────────────────────
create or replace function bot_members(token text, gid uuid, lim int default 200)
returns table (user_id uuid, username text, display_name text, is_bot boolean, role text, joined_at timestamptz, timeout_until timestamptz)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  if not bot_in_group(bid, gid) then raise exception 'The bot is not in that group'; end if;
  return query select m.user_id, p.username, p.display_name, p.is_bot, m.role, m.joined_at, m.timeout_until
    from group_members m join profiles p on p.id = m.user_id where m.group_id = gid
    order by m.joined_at limit least(greatest(coalesce(lim, 200), 1), 1000);
end $$;

create or replace function bot_history(token text, channel uuid, before_t timestamptz default null, lim int default 50)
returns table (id uuid, author_id uuid, author_username text, author_name text, author_is_bot boolean, content text, reply_to uuid, created_at timestamptz, edited_at timestamptz, pinned boolean)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not bot_in_group(bid, gid) then raise exception 'The bot is not in that channel''s group'; end if;
  return query select m.id, m.author_id, p.username, p.display_name, p.is_bot, m.content, m.reply_to, m.created_at, m.edited_at,
      exists (select 1 from pins x where x.message_id = m.id)
    from messages m join profiles p on p.id = m.author_id
    where m.channel_id = channel and (before_t is null or m.created_at < before_t)
    order by m.created_at desc limit least(greatest(coalesce(lim, 50), 1), 100);
end $$;

create or replace function bot_get_message(token text, message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); r jsonb;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  select jsonb_build_object('id', m.id, 'channel_id', m.channel_id, 'group_id', c.group_id, 'author_id', m.author_id, 'author_username', p.username,
      'author_name', p.display_name, 'author_is_bot', p.is_bot, 'content', m.content, 'reply_to', m.reply_to, 'created_at', m.created_at, 'edited_at', m.edited_at,
      'reactions', coalesce((select jsonb_object_agg(k, n) from (select kind as k, count(*) as n from reactions where message_id = m.id group by kind) z), '{}'::jsonb))
    into r
    from messages m join channels c on c.id = m.channel_id join profiles p on p.id = m.author_id
    where m.id = message and bot_in_group(bid, c.group_id);
  if r is null then raise exception 'The bot cannot see that message'; end if;
  return r;
end $$;

create or replace function bot_poll_results(token text, message uuid) returns table (opt smallint, votes bigint)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  if not exists (select 1 from messages m join channels c on c.id = m.channel_id where m.id = message and bot_in_group(bid, c.group_id)) then
    raise exception 'The bot cannot see that message';
  end if;
  return query select v.opt, count(*) from poll_votes v where v.message_id = message group by v.opt order by v.opt;
end $$;

-- ───────────────────────── Acting on messages ─────────────────────────
-- Deleting: the bot's own messages always; other people's need the "messages" permission.
create or replace function bot_delete(token text, message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); aid uuid; gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'delete', 60, interval '1 minute');
  select m.author_id, c.group_id into aid, gid from messages m join channels c on c.id = m.channel_id where m.id = message;
  if aid is null then return; end if;
  if aid <> bid and not bot_can(bid, gid, 'messages') then raise exception 'The bot needs the messages permission to delete other people''s messages'; end if;
  perform bot_act(bid);
  delete from messages where id = message;
end $$;

create or replace function bot_pin(token text, message uuid, pin boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'pin', 30, interval '1 minute');
  perform bot_act(bid);
  perform set_pin(message, coalesce(pin, true));
end $$;

create or replace function bot_unreact(token text, message uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'react', 60, interval '1 minute');
  delete from reactions r where r.message_id = message and r.user_id = bid and r.kind = bot_unreact.kind;
end $$;

-- ───────────────────────── Moderation (needs the "members" permission) ─────────────────────────
create or replace function bot_kick(token text, gid uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  if not bot_can(bid, gid, 'members') then raise exception 'The bot needs the members permission'; end if;
  if member = bid then raise exception 'A bot cannot remove itself this way (use leave)'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = member and role = 'member') then raise exception 'That person cannot be removed'; end if;
  perform bot_act(bid);
  delete from group_members where group_id = gid and user_id = member;
end $$;

create or replace function bot_timeout(token text, gid uuid, member uuid, minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  perform bot_act(bid);
  perform timeout_member(gid, member, minutes);
end $$;

-- ───────────────────────── Channels (needs the "channels" permission) ─────────────────────────
create or replace function bot_create_channel(token text, gid uuid, cname text, topic text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); cid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  if not bot_can(bid, gid, 'channels') then raise exception 'The bot needs the channels permission'; end if;
  if (select count(*) from channels where group_id = gid) >= 50 then raise exception 'A group can have up to 50 channels'; end if;
  perform bot_act(bid);
  insert into channels(group_id, name, topic, position) values (gid, lower(cname), left(coalesce(topic, ''), 120), coalesce((select max(position) + 1 from channels where group_id = gid), 0)) returning id into cid;
  return cid;
end $$;

create or replace function bot_delete_channel(token text, channel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null then return; end if;
  if not bot_can(bid, gid, 'channels') then raise exception 'The bot needs the channels permission'; end if;
  if (select count(*) from channels where group_id = gid) <= 1 then raise exception 'A group needs at least one channel'; end if;
  perform bot_act(bid);
  delete from channels where id = channel;
end $$;

-- ───────────────────────── Presence, leaving ─────────────────────────
create or replace function bot_set_status(token text, kind text default null, name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'status', 20, interval '1 minute');
  if kind is null or name is null or btrim(name) = '' then
    update profiles set activity_type = null, activity_name = null, activity_at = null where id = bid;
  else
    if kind not in ('playing', 'listening', 'watching', 'streaming', 'competing', 'building') then raise exception 'kind must be playing, listening, watching, streaming, competing or building'; end if;
    update profiles set activity_type = kind, activity_name = left(btrim(name), 40), activity_at = now() where id = bid;
  end if;
end $$;

create or replace function bot_leave(token text, gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  delete from group_members where group_id = gid and user_id = bid;
end $$;

-- ───────────────────────── Storage for the bot's own data ─────────────────────────
-- A small key-value store so a bot can remember things (scores, settings) without running a database.
create table if not exists bot_kv (
  bot_id uuid not null references profiles(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (bot_id, key)
);
alter table bot_kv enable row level security; -- no policies: only the functions below touch it

create or replace function bot_kv_set(token text, key text, value jsonb) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'kv', 120, interval '1 minute');
  if bot_kv_set.value is null or length(bot_kv_set.value::text) > 8000 then raise exception 'Values must be JSON under 8000 characters'; end if;
  if not exists (select 1 from bot_kv k where k.bot_id = bid and k.key = bot_kv_set.key) and (select count(*) from bot_kv k where k.bot_id = bid) >= 500 then
    raise exception 'A bot can store up to 500 keys';
  end if;
  insert into bot_kv(bot_id, key, value) values (bid, bot_kv_set.key, bot_kv_set.value)
    on conflict (bot_id, key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function bot_kv_get(token text, key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); v jsonb;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'kv', 120, interval '1 minute');
  select k.value into v from bot_kv k where k.bot_id = bid and k.key = bot_kv_get.key;
  return v;
end $$;

create or replace function bot_kv_delete(token text, key text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'kv', 120, interval '1 minute');
  delete from bot_kv k where k.bot_id = bid and k.key = bot_kv_delete.key;
end $$;

create or replace function bot_kv_list(token text, prefix text default '') returns table (key text, value jsonb)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'kv', 120, interval '1 minute');
  return query select k.key, k.value from bot_kv k where k.bot_id = bid and k.key like replace(replace(coalesce(prefix, ''), '%', ''), '_', '') || '%' order by k.key limit 500;
end $$;

grant execute on function bot_me(text), bot_events2(text, timestamptz, int), bot_members(text, uuid, int), bot_history(text, uuid, timestamptz, int),
  bot_get_message(text, uuid), bot_poll_results(text, uuid), bot_delete(text, uuid), bot_pin(text, uuid, boolean), bot_unreact(text, uuid, text),
  bot_kick(text, uuid, uuid), bot_timeout(text, uuid, uuid, int), bot_create_channel(text, uuid, text, text), bot_delete_channel(text, uuid),
  bot_set_status(text, text, text), bot_leave(text, uuid), bot_kv_set(text, text, jsonb), bot_kv_get(text, text), bot_kv_delete(text, text),
  bot_kv_list(text, text) to anon, authenticated;
