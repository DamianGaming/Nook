-- Nook v26: GIF favourites, bot default permissions (chosen when a bot is made and applied when the founder adds it),
-- and more powerful bots (channel names and topics, group details, invite code, purge, search, audit log, user lookup).
-- Safe to run more than once. Run after update_v25.sql.

-- ───────────────────────── GIF favourites ─────────────────────────
create table if not exists gif_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  url text not null check (url ~ '^https://media[0-9]*\.giphy\.com/media/[A-Za-z0-9_-]{4,40}/giphy\.gif$'),
  preview text not null check (char_length(preview) <= 300 and preview ~ '^https://[a-z0-9.-]+\.giphy\.com/'),
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);
alter table gif_favorites enable row level security;
drop policy if exists "own gif favourites" on gif_favorites;
create policy "own gif favourites" on gif_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on gif_favorites to authenticated;

create or replace function limit_gif_favorites() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from gif_favorites where user_id = new.user_id) >= 300 then raise exception 'You can keep up to 300 favourite GIFs'; end if;
  return new;
end $$;
drop trigger if exists gif_favorites_limit on gif_favorites;
create trigger gif_favorites_limit before insert on gif_favorites for each row execute function limit_gif_favorites();

-- ───────────────────────── Bot default permissions ─────────────────────────
alter table bots add column if not exists default_perms text[] not null default '{}';

create or replace function clean_bot_perms(p text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p, '{}')) x where x in ('channels', 'messages', 'emoji', 'invites', 'members', 'customize')
$$;

drop function if exists create_bot(text, text, text);
create or replace function create_bot(uname text, dname text, descr text default '', perms text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := gen_random_uuid(); tok text := bot_new_token(); code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('create_bot', 10, interval '1 day');
  uname := lower(btrim(coalesce(uname, '')));
  if uname !~ '^[a-z0-9_]{3,20}$' then raise exception 'The username must be 3 to 20 letters, numbers or underscores'; end if;
  if (select count(*) from bots where owner = auth.uid()) >= 10 then raise exception 'You can have up to 10 bots'; end if;
  if exists (select 1 from profiles where username = uname) then raise exception 'That username is taken'; end if;
  dname := left(btrim(coalesce(nullif(dname, ''), uname)), 32);
  insert into profiles(id, username, display_name, bio, is_bot, bot_owner, avatar_emoji, status)
    values (bid, uname, dname, left(coalesce(descr, ''), 200), true, auth.uid(), '🤖', 'online');
  insert into bots(id, owner, token_hash, default_perms) values (bid, auth.uid(), bot_hash(tok), clean_bot_perms(perms)) returning add_code into code;
  return jsonb_build_object('id', bid, 'token', tok, 'add_code', code, 'default_perms', clean_bot_perms(perms));
end $$;

create or replace function set_bot_default_perms(bid uuid, perms text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bots where id = bid and owner = auth.uid()) then raise exception 'That is not your bot'; end if;
  update bots set default_perms = clean_bot_perms(perms) where id = bid;
end $$;

drop function if exists my_bots();
create or replace function my_bots() returns table (id uuid, username text, display_name text, description text, avatar_url text, add_code text, created_at timestamptz, groups bigint, default_perms text[])
language sql stable security definer set search_path = public as $$
  select b.id, p.username, p.display_name, p.bio, p.avatar_url, b.add_code, b.created_at,
         (select count(*) from group_members m where m.user_id = b.id), b.default_perms
  from bots b join profiles p on p.id = b.id where b.owner = auth.uid() order by b.created_at
$$;

drop function if exists bot_by_code(text);
create or replace function bot_by_code(code text) returns table (id uuid, username text, display_name text, description text, avatar_url text, owner_name text, default_perms text[])
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform hit('bot_lookup', 60, interval '1 hour');
  return query select b.id, p.username, p.display_name, p.bio, p.avatar_url, o.username, b.default_perms
    from bots b join profiles p on p.id = b.id join profiles o on o.id = b.owner where b.add_code = btrim(code);
end $$;

-- When a bot joins a group it gets the permissions its owner chose. The founder can hand over all of them; anyone else
-- (who has the members permission) can only pass on permissions they hold themselves. Edit them later in Group settings > Members.
create or replace function add_bot_to_group(gid uuid, code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid; want text[]; give text[];
begin
  if not has_perm(gid, 'members') then raise exception 'You need the members permission to add a bot'; end if;
  perform hit('bot_add', 20, interval '1 hour');
  select id, default_perms into bid, want from bots where add_code = btrim(code);
  if bid is null then raise exception 'That bot code is not valid'; end if;
  if (select count(*) from group_members m join profiles p on p.id = m.user_id where m.group_id = gid and p.is_bot) >= 10 then raise exception 'A group can have up to 10 bots'; end if;
  if is_group_founder(gid) then give := want;
  else give := coalesce((select array_agg(x) from unnest(want) x where x = any(coalesce((select perms from group_members where group_id = gid and user_id = auth.uid()), '{}'))), '{}');
  end if;
  insert into group_members(group_id, user_id, perms) values (gid, bid, give) on conflict do nothing;
  perform audit_add(gid, 'bot_add', bid, array_to_string(give, ','));
  return bid;
end $$;

-- ───────────────────────── More power for bots ─────────────────────────
create or replace function bot_rename_channel(token text, channel uuid, cname text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not bot_can(bid, gid, 'channels') then raise exception 'The bot needs the channels permission'; end if;
  perform bot_act(bid);
  update channels set name = lower(cname) where id = channel;
end $$;

create or replace function bot_set_topic(token text, channel uuid, topic text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not bot_can(bid, gid, 'channels') then raise exception 'The bot needs the channels permission'; end if;
  perform bot_act(bid);
  update channels set topic = left(coalesce(bot_set_topic.topic, ''), 120) where id = channel;
end $$;

create or replace function bot_group_update(token text, gid uuid, gname text default null, descr text default null) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  if not bot_can(bid, gid, 'customize') then raise exception 'The bot needs the customize permission'; end if;
  perform bot_act(bid);
  update groups set name = coalesce(nullif(left(btrim(gname), 40), ''), name), description = case when descr is null then description else left(descr, 200) end where id = gid;
end $$;

create or replace function bot_invite_code(token text, gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); c text;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  if not bot_can(bid, gid, 'invites') then raise exception 'The bot needs the invites permission'; end if;
  select invite_code into c from groups where id = gid;
  return c;
end $$;

create or replace function bot_purge(token text, channel uuid, n int default 10) returns int
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid; cnt int;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'mod', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not bot_can(bid, gid, 'messages') then raise exception 'The bot needs the messages permission'; end if;
  perform bot_act(bid);
  with doomed as (select id from messages where channel_id = channel order by created_at desc limit least(greatest(coalesce(n, 10), 1), 100)),
       gone as (delete from messages where id in (select id from doomed) returning 1)
  select count(*) into cnt from gone;
  return cnt;
end $$;

create or replace function bot_pins(token text, channel uuid)
returns table (id uuid, author_username text, content text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not bot_in_group(bid, gid) then raise exception 'The bot is not in that channel''s group'; end if;
  return query select m.id, p.username, m.content, m.created_at from pins x join messages m on m.id = x.message_id join profiles p on p.id = m.author_id
    where m.channel_id = channel order by m.created_at desc limit 50;
end $$;

create or replace function bot_search(token text, gid uuid, q text, lim int default 20)
returns table (id uuid, channel_id uuid, channel_name text, author_username text, content text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  if not bot_in_group(bid, gid) then raise exception 'The bot is not in that group'; end if;
  if char_length(btrim(coalesce(q, ''))) < 2 then raise exception 'Search for at least two letters'; end if;
  return query select m.id, m.channel_id, c.name, p.username, m.content, m.created_at
    from messages m join channels c on c.id = m.channel_id join profiles p on p.id = m.author_id
    where c.group_id = gid and m.content ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by m.created_at desc limit least(greatest(coalesce(lim, 20), 1), 50);
end $$;

create or replace function bot_audit(token text, gid uuid, lim int default 30)
returns table (created_at timestamptz, action text, actor_username text, target_username text, detail text)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  if not bot_can(bid, gid, 'members') then raise exception 'The bot needs the members permission'; end if;
  return query select a.created_at, a.action, ap.username, tp.username, a.detail
    from group_audit a left join profiles ap on ap.id = a.actor left join profiles tp on tp.id = a.target
    where a.group_id = gid order by a.created_at desc limit least(greatest(coalesce(lim, 30), 1), 100);
end $$;

-- Look someone up by username (only people who share a group with the bot).
create or replace function bot_user(token text, uname text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); r jsonb;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'read', 120, interval '1 minute');
  select jsonb_build_object('id', p.id, 'username', p.username, 'name', p.display_name, 'bio', p.bio, 'is_bot', p.is_bot,
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', m.group_id, 'role', m.role, 'joined_at', m.joined_at, 'timeout_until', m.timeout_until))
                          from group_members m where m.user_id = p.id and bot_in_group(bid, m.group_id)), '[]'::jsonb))
    into r from profiles p where p.username = lower(btrim(uname))
      and exists (select 1 from group_members m where m.user_id = p.id and bot_in_group(bid, m.group_id));
  if r is null then raise exception 'No one called that shares a group with the bot'; end if;
  return r;
end $$;

grant execute on function create_bot(text, text, text, text[]), set_bot_default_perms(uuid, text[]), my_bots(), bot_by_code(text), add_bot_to_group(uuid, text) to authenticated;
grant execute on function bot_rename_channel(text, uuid, text), bot_set_topic(text, uuid, text), bot_group_update(text, uuid, text, text), bot_invite_code(text, uuid),
  bot_purge(text, uuid, int), bot_pins(text, uuid), bot_search(text, uuid, text, int), bot_audit(text, uuid, int), bot_user(text, text) to anon, authenticated;
