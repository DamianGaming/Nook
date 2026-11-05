-- Nook v24: bots + developer portal, threads, polls, saved messages, search filters,
-- group rules / welcome, stickers. Safe to run more than once.

-- ───────────────────────── Bots ─────────────────────────
-- A bot is a profile with is_bot = true (so it shows in member lists, can be @mentioned and can post),
-- plus a row in `bots` holding its owner and a hashed token. The token itself is shown once and never stored.
alter table profiles add column if not exists is_bot boolean not null default false;
alter table profiles add column if not exists bot_owner uuid;

-- Bot profiles have no sign-in account behind them, so profiles can no longer require one.
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'public.profiles'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass limit 1;
  if c is not null then execute format('alter table public.profiles drop constraint %I', c); end if;
end $$;
-- ...so deleting an account removes its profile here instead (what the foreign key used to do).
create or replace function profiles_follow_auth_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin delete from profiles where id = old.id and not is_bot; return old; end $$;
drop trigger if exists auth_users_profile_cleanup on auth.users;
create trigger auth_users_profile_cleanup after delete on auth.users for each row execute function profiles_follow_auth_delete();

create table if not exists bots (
  id uuid primary key references profiles(id) on delete cascade,
  owner uuid not null references profiles(id) on delete cascade,
  token_hash text not null,
  add_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);
create index if not exists bots_owner_idx on bots (owner);
alter table bots enable row level security; -- no policies: everything goes through the functions below

create or replace function bot_hash(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'utf8')), 'hex') $$;
create or replace function bot_new_token() returns text language sql volatile as $$ select 'nk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

create or replace function create_bot(uname text, dname text, descr text default '') returns jsonb
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
  insert into bots(id, owner, token_hash) values (bid, auth.uid(), bot_hash(tok)) returning add_code into code;
  return jsonb_build_object('id', bid, 'token', tok, 'add_code', code);
end $$;

create or replace function my_bots() returns table (id uuid, username text, display_name text, description text, avatar_url text, add_code text, created_at timestamptz, groups bigint)
language sql stable security definer set search_path = public as $$
  select b.id, p.username, p.display_name, p.bio, p.avatar_url, b.add_code, b.created_at,
         (select count(*) from group_members m where m.user_id = b.id)
  from bots b join profiles p on p.id = b.id where b.owner = auth.uid() order by b.created_at
$$;

create or replace function update_bot(bid uuid, dname text, descr text, avatar text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bots where id = bid and owner = auth.uid()) then raise exception 'That is not your bot'; end if;
  update profiles set display_name = left(btrim(coalesce(nullif(dname, ''), username)), 32), bio = left(coalesce(descr, ''), 200), avatar_url = nullif(avatar, '')
   where id = bid;
end $$;

create or replace function regenerate_bot_token(bid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := bot_new_token();
begin
  if not exists (select 1 from bots where id = bid and owner = auth.uid()) then raise exception 'That is not your bot'; end if;
  update bots set token_hash = bot_hash(tok) where id = bid;
  return tok;
end $$;

create or replace function regenerate_bot_code(bid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if not exists (select 1 from bots where id = bid and owner = auth.uid()) then raise exception 'That is not your bot'; end if;
  update bots set add_code = c where id = bid;
  return c;
end $$;

create or replace function delete_bot(bid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bots where id = bid and owner = auth.uid()) then raise exception 'That is not your bot'; end if;
  delete from messages where author_id = bid;
  delete from profiles where id = bid and is_bot;
end $$;

-- What a group manager sees before adding a bot by its code.
create or replace function bot_by_code(code text) returns table (id uuid, username text, display_name text, description text, avatar_url text, owner_name text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform hit('bot_lookup', 60, interval '1 hour');
  return query select b.id, p.username, p.display_name, p.bio, p.avatar_url, o.username
    from bots b join profiles p on p.id = b.id join profiles o on o.id = b.owner where b.add_code = btrim(code);
end $$;

create or replace function add_bot_to_group(gid uuid, code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if not has_perm(gid, 'members') then raise exception 'You need the members permission to add a bot'; end if;
  perform hit('bot_add', 20, interval '1 hour');
  select id into bid from bots where add_code = btrim(code);
  if bid is null then raise exception 'That bot code is not valid'; end if;
  if (select count(*) from group_members m join profiles p on p.id = m.user_id where m.group_id = gid and p.is_bot) >= 10 then raise exception 'A group can have up to 10 bots'; end if;
  insert into group_members(group_id, user_id) values (gid, bid) on conflict do nothing;
  perform audit_add(gid, 'bot_add', bid, '');
  return bid;
end $$;

-- ── The bot API. Bots are ordinary programs that call these over HTTPS with their token (see /developers). ──
create or replace function bot_auth(tok text) returns uuid language sql stable security definer set search_path = public as $$
  select id from bots where token_hash = bot_hash(tok)
$$;
revoke all on function bot_auth(text) from public, anon, authenticated;

create or replace function bot_hit(bid uuid, k text, max_n int, win interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.02 then delete from rate_events where at < now() - interval '1 day'; end if;
  if (select count(*) from rate_events where user_id = bid and key = k and at > now() - win) >= max_n then
    raise exception 'Rate limit reached for %. Slow down and try again shortly.', k;
  end if;
  insert into rate_events(user_id, key) values (bid, k);
end $$;
revoke all on function bot_hit(uuid, text, int, interval) from public, anon, authenticated;

create or replace function bot_me(token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  return jsonb_build_object(
    'now', now(),
    'id', bid,
    'username', (select username from profiles where id = bid),
    'name', (select display_name from profiles where id = bid),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'channels',
        coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.position) from channels c where c.group_id = g.id), '[]'::jsonb)))
      from group_members m join groups g on g.id = m.group_id where m.user_id = bid), '[]'::jsonb));
end $$;

create or replace function bot_events(token text, after timestamptz, lim int default 50)
returns table (id uuid, channel_id uuid, channel_name text, group_id uuid, group_name text, author_id uuid, author_username text, author_name text, author_is_bot boolean, content text, reply_to uuid, mentioned boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); uname text;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'events', 240, interval '1 minute');
  if after is null then return; end if;
  select username into uname from profiles where profiles.id = bid;
  return query
    select m.id, m.channel_id, c.name, c.group_id, g.name, m.author_id, p.username, p.display_name, p.is_bot, m.content, m.reply_to,
           (m.content ilike '%@' || uname || '%' or exists (select 1 from messages r where r.id = m.reply_to and r.author_id = bid)),
           m.created_at
    from messages m
    join channels c on c.id = m.channel_id
    join groups g on g.id = c.group_id
    join profiles p on p.id = m.author_id
    where m.created_at > after and m.author_id <> bid
      and c.group_id in (select gm.group_id from group_members gm where gm.user_id = bid)
    order by m.created_at asc
    limit least(greatest(coalesce(lim, 50), 1), 100);
end $$;

create or replace function bot_send(token text, channel uuid, content text, reply uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); mid uuid; gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'send', 60, interval '1 minute');
  content := coalesce(content, '');
  if char_length(content) < 1 or char_length(content) > 2000 then raise exception 'Messages must be 1 to 2000 characters'; end if;
  select group_id into gid from channels where id = channel;
  if gid is null or not exists (select 1 from group_members where group_id = gid and user_id = bid) then raise exception 'The bot is not in that channel''s group'; end if;
  if reply is not null and not exists (select 1 from messages where id = reply and channel_id = channel) then reply := null; end if;
  insert into messages(channel_id, author_id, content, reply_to) values (channel, bid, content, reply) returning id into mid;
  return mid;
end $$;

create or replace function bot_edit(token text, message uuid, content text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'edit', 60, interval '1 minute');
  if char_length(coalesce(content, '')) not between 1 and 2000 then raise exception 'Messages must be 1 to 2000 characters'; end if;
  update messages set content = bot_edit.content, edited_at = now() where id = message and author_id = bid;
  if not found then raise exception 'You can only edit the bot''s own messages'; end if;
end $$;

create or replace function bot_delete(token text, message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'delete', 60, interval '1 minute');
  delete from messages where id = message and author_id = bid;
end $$;

create or replace function bot_react(token text, message uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'react', 60, interval '1 minute');
  if char_length(coalesce(kind, '')) not between 1 and 80 then raise exception 'Invalid reaction'; end if;
  if not exists (select 1 from messages m join channels c on c.id = m.channel_id join group_members gm on gm.group_id = c.group_id
                 where m.id = message and gm.user_id = bid) then raise exception 'The bot cannot see that message'; end if;
  insert into reactions(message_id, user_id, kind) values (message, bid, kind) on conflict do nothing;
end $$;

grant execute on function bot_me(text), bot_events(text, timestamptz, int), bot_send(text, uuid, text, uuid), bot_edit(text, uuid, text),
  bot_delete(text, uuid), bot_react(text, uuid, text) to anon, authenticated;
grant execute on function create_bot(text, text, text), my_bots(), update_bot(uuid, text, text, text), regenerate_bot_token(uuid),
  regenerate_bot_code(uuid), delete_bot(uuid), bot_by_code(text), add_bot_to_group(uuid, text) to authenticated;

-- Bots cannot be messaged directly.
create or replace function start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; did uuid;
begin
  if other = auth.uid() then raise exception 'You cannot DM yourself'; end if;
  if exists (select 1 from profiles where id = other and is_bot) then raise exception 'Bots cannot be messaged directly. Talk to them in a group channel.'; end if;
  if is_blocked_between(auth.uid(), other) then raise exception 'You cannot message this user'; end if;
  a := least(auth.uid(), other); b := greatest(auth.uid(), other);
  select id into did from dms where user_a = a and user_b = b;
  if did is null then insert into dms(user_a, user_b) values (a, b) returning id into did; end if;
  return did;
end $$;

create index if not exists messages_created_idx on messages (created_at);

-- ───────────────────────── Threads ─────────────────────────
create index if not exists messages_reply_idx on messages (reply_to) where reply_to is not null;
create or replace function reply_counts(ids uuid[]) returns table (id uuid, n bigint)
language sql stable set search_path = public as $$ -- runs as the caller, so it only counts what they may see
  select m.reply_to, count(*) from messages m where m.reply_to = any(ids) group by m.reply_to
$$;
grant execute on function reply_counts(uuid[]) to authenticated;

-- ───────────────────────── Polls ─────────────────────────
-- The poll itself is a message (its text starts with <poll>). Votes live here: one per person per poll.
create table if not exists poll_votes (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  opt smallint not null check (opt between 0 and 9),
  voted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table poll_votes enable row level security;
drop policy if exists "votes read" on poll_votes;
create policy "votes read" on poll_votes for select to authenticated using (exists (select 1 from messages m where m.id = message_id));
drop policy if exists "votes write" on poll_votes;
create policy "votes write" on poll_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'poll_votes') then
    alter publication supabase_realtime add table poll_votes;
  end if;
end $$;

create or replace function poll_vote(mid uuid, o int) returns void
language plpgsql set search_path = public as $$
begin
  perform hit('vote', 60, interval '1 minute');
  if o is null then delete from poll_votes where message_id = mid and user_id = auth.uid(); return; end if;
  insert into poll_votes(message_id, user_id, opt) values (mid, auth.uid(), o)
    on conflict (message_id, user_id) do update set opt = excluded.opt, voted_at = now();
end $$;
create or replace function poll_results(ids uuid[]) returns table (message_id uuid, opt smallint, n bigint, mine boolean)
language sql stable set search_path = public as $$
  select v.message_id, v.opt, count(*), bool_or(v.user_id = auth.uid())
  from poll_votes v where v.message_id = any(ids) group by v.message_id, v.opt
$$;
grant execute on function poll_vote(uuid, int), poll_results(uuid[]) to authenticated;

-- ───────────────────────── Saved messages ─────────────────────────
create table if not exists bookmarks (
  user_id uuid not null references profiles(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table bookmarks enable row level security;
drop policy if exists "bookmarks own" on bookmarks;
create policy "bookmarks own" on bookmarks for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id));
create or replace function limit_bookmarks() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from bookmarks where user_id = new.user_id) >= 500 then raise exception 'You can save up to 500 messages'; end if;
  return new;
end $$;
drop trigger if exists limit_bookmarks on bookmarks;
create trigger limit_bookmarks before insert on bookmarks for each row execute function limit_bookmarks();

-- ───────────────────────── Search with filters ─────────────────────────
create or replace function search_messages2(q text, gid uuid, from_user uuid default null, has text default null, before_t timestamptz default null, after_t timestamptz default null, lim int default 40)
returns table (id uuid, channel_id uuid, channel_name text, author_id uuid, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pat text;
begin
  if not is_group_member(gid) then raise exception 'Not allowed'; end if;
  q := trim(coalesce(q, ''));
  if char_length(q) < 2 and from_user is null and has is null and before_t is null and after_t is null then return; end if;
  pat := '%' || replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select m.id, m.channel_id, c.name, m.author_id, m.content, m.created_at
    from messages m join channels c on c.id = m.channel_id
    where c.group_id = gid
      and (q = '' or m.content ilike pat)
      and (from_user is null or m.author_id = from_user)
      and (before_t is null or m.created_at < before_t)
      and (after_t is null or m.created_at >= after_t)
      and (has is null
           or (has = 'image' and m.attachment_url is not null and m.attachment_url !~* '\.(mp4|webm|mov|m4v|mp3|m4a|aac|ogg|wav|weba)(\?|$)')
           or (has = 'video' and m.attachment_url ~* '\.(mp4|webm|mov|m4v)(\?|$)')
           or (has = 'audio' and m.attachment_url ~* '\.(mp3|m4a|aac|ogg|wav|weba)(\?|$)')
           or (has = 'file' and m.attachment_url is not null)
           or (has = 'link' and m.content ~* 'https?://'))
    order by m.created_at desc
    limit least(greatest(coalesce(lim, 40), 1), 100);
end $$;
grant execute on function search_messages2(text, uuid, uuid, text, timestamptz, timestamptz, int) to authenticated;

-- ───────────────────────── Welcome message and rules ─────────────────────────
alter table groups add column if not exists welcome text;
alter table groups add column if not exists rules text;
alter table groups add column if not exists first_channel uuid;
alter table groups drop constraint if exists groups_welcome_check;
alter table groups add constraint groups_welcome_check check (welcome is null or char_length(welcome) <= 500);
alter table groups drop constraint if exists groups_rules_check;
alter table groups add constraint groups_rules_check check (rules is null or char_length(rules) <= 1500);
alter table group_members add column if not exists rules_ok_at timestamptz;

-- Changing the rules asks everyone to read and accept them again.
create or replace function reset_rules_ok() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rules is distinct from old.rules then update group_members set rules_ok_at = null where group_id = new.id; end if;
  return new;
end $$;
drop trigger if exists reset_rules_ok on groups;
create trigger reset_rules_ok after update of rules on groups for each row execute function reset_rules_ok();

create or replace function accept_rules(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update group_members set rules_ok_at = now() where group_id = gid and user_id = auth.uid();
end $$;
grant execute on function accept_rules(uuid) to authenticated;

-- Until the rules are accepted, a member can read but not post. The founder, managers who set the rules and bots are exempt.
create or replace function enforce_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid; r text; ok timestamptz; role_ text; bot boolean;
begin
  if new.channel_id is null then return new; end if;
  select c.group_id, g.rules into gid, r from channels c join groups g on g.id = c.group_id where c.id = new.channel_id;
  if r is null or btrim(r) = '' then return new; end if;
  select gm.rules_ok_at, gm.role into ok, role_ from group_members gm where gm.group_id = gid and gm.user_id = new.author_id;
  select is_bot into bot from profiles where id = new.author_id;
  if coalesce(bot, false) or role_ = 'founder' or ok is not null then return new; end if;
  raise exception 'Read and accept this group''s rules before posting.';
end $$;
drop trigger if exists messages_rules on messages;
create trigger messages_rules before insert on messages for each row execute function enforce_rules();

-- ───────────────────────── Stickers ─────────────────────────
create table if not exists group_stickers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url text not null check (char_length(url) <= 500 and url like '%/storage/v1/object/public/media/%'),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
alter table group_stickers enable row level security;
drop policy if exists "stickers read" on group_stickers;
create policy "stickers read" on group_stickers for select to authenticated using (is_group_member(group_id));
drop policy if exists "stickers add" on group_stickers;
create policy "stickers add" on group_stickers for insert to authenticated with check (has_perm(group_id, 'emoji') and created_by = auth.uid());
drop policy if exists "stickers remove" on group_stickers;
create policy "stickers remove" on group_stickers for delete to authenticated using (has_perm(group_id, 'emoji'));
create or replace function limit_group_stickers() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from group_stickers where group_id = new.group_id) >= 30 then raise exception 'A group can have up to 30 stickers'; end if;
  return new;
end $$;
drop trigger if exists limit_group_stickers on group_stickers;
create trigger limit_group_stickers before insert on group_stickers for each row execute function limit_group_stickers();
create or replace function stickers_by_ids(ids uuid[]) returns table (id uuid, name text, url text)
language sql security definer stable set search_path = public as $$
  select s.id, s.name, s.url from group_stickers s where s.id = any(ids) limit 100;
$$;
grant execute on function stickers_by_ids(uuid[]) to authenticated;
