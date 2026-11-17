-- Nook v21: reactions with any emoji, stronger rate limits, message search, pins, notification settings,
-- moderation (timeouts, bulk delete, audit log), web push subscriptions and a client error log.
-- Safe to run more than once.

create extension if not exists pg_trgm;

-- ───────────── Rate limiting helper ─────────────
create table if not exists rate_events (
  user_id uuid not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_idx on rate_events (user_id, key, at desc);
alter table rate_events enable row level security; -- no policies: only the functions below touch it

create or replace function hit(k text, max_n int, win interval) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if random() < 0.02 then delete from rate_events where at < now() - interval '1 day'; end if;
  if (select count(*) from rate_events where user_id = uid and key = k and at > now() - win) >= max_n then
    raise exception 'You are doing that too often. Please wait a little and try again.';
  end if;
  insert into rate_events(user_id, key) values (uid, k);
end $$;
revoke all on function hit(text, int, interval) from public, anon, authenticated;

create or replace function rl_friend() returns trigger language plpgsql security definer set search_path = public as $$
begin perform hit('friend', 30, interval '1 hour'); return new; end $$;
drop trigger if exists rl_friend on friendships;
create trigger rl_friend before insert on friendships for each row execute function rl_friend();

create or replace function rl_group() returns trigger language plpgsql security definer set search_path = public as $$
begin perform hit('group', 5, interval '1 hour'); return new; end $$;
drop trigger if exists rl_group on groups;
create trigger rl_group before insert on groups for each row execute function rl_group();

create or replace function rl_react() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform hit('react', 60, interval '1 minute');
  if not exists (select 1 from reactions where message_id = new.message_id and kind = new.kind)
     and (select count(distinct kind) from reactions where message_id = new.message_id) >= 20 then
    raise exception 'This message already has the most different reactions it can have.';
  end if;
  return new;
end $$;
drop trigger if exists rl_react on reactions;
create trigger rl_react before insert on reactions for each row execute function rl_react();

create or replace function rl_report() returns trigger language plpgsql security definer set search_path = public as $$
begin perform hit('report', 10, interval '1 hour'); return new; end $$;
drop trigger if exists rl_report on reports;
create trigger rl_report before insert on reports for each row execute function rl_report();

-- messages: 8 per 10 seconds (as before) and 40 per minute
create or replace function rate_limit_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8
     or (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'You are sending messages too fast. Slow down a little.';
  end if;
  return new;
end $$;

-- Invite codes cannot be guessed: a wrong code does not raise (so the attempt is kept) and returns nothing.
create or replace function join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  perform hit('join', 20, interval '1 hour');
  select id into gid from groups where invite_code = code;
  if gid is null then return null; end if;
  insert into group_members(group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

-- ───────────── Reactions: any emoji ─────────────
alter table reactions drop constraint if exists reactions_kind_check;
update reactions set kind = case kind when 'heart' then '❤️' when 'like' then '👍' when 'smile' then '😊' when 'star' then '⭐' else kind end
  where kind in ('heart', 'like', 'smile', 'star');
alter table reactions drop constraint if exists reactions_kind_check2;
alter table reactions add constraint reactions_kind_check2 check (
  char_length(kind) between 1 and 80
  and (kind ~ '^<e:[0-9a-f-]{36}:[a-z0-9_]{2,32}>$' or kind !~ '^[A-Za-z0-9 _.,!?-]+$')
);
alter table reactions replica identity full;

-- ───────────── Pinned messages ─────────────
create table if not exists pins (
  message_id uuid primary key references messages(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  dm_id uuid references dms(id) on delete cascade,
  pinned_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists pins_channel_idx on pins (channel_id);
create index if not exists pins_dm_idx on pins (dm_id);
alter table pins enable row level security;
drop policy if exists "pins read" on pins;
create policy "pins read" on pins for select to authenticated using (exists (select 1 from messages m where m.id = pins.message_id));
alter table pins replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pins') then
    alter publication supabase_realtime add table pins;
  end if;
end $$;

create or replace function set_pin(mid uuid, pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m messages; gid uuid;
begin
  select * into m from messages where id = mid;
  if not found then raise exception 'Message not found'; end if;
  if m.dm_id is not null then
    if not is_dm_member(m.dm_id) then raise exception 'Not allowed'; end if;
  else
    gid := channel_group(m.channel_id);
    if not (is_group_member(gid) and has_perm(gid, 'messages')) then raise exception 'You need the messages permission to pin'; end if;
  end if;
  if pin then
    if (select count(*) from pins where channel_id is not distinct from m.channel_id and dm_id is not distinct from m.dm_id) >= 50 then
      raise exception 'You can pin up to 50 messages here.';
    end if;
    insert into pins(message_id, channel_id, dm_id, pinned_by) values (mid, m.channel_id, m.dm_id, auth.uid()) on conflict do nothing;
  else
    delete from pins where message_id = mid;
  end if;
end $$;

-- ───────────── Search (group channels; direct messages are encrypted, so they are searched on your device) ─────────────
create index if not exists messages_content_trgm on messages using gin (content gin_trgm_ops) where channel_id is not null;

create or replace function search_messages(q text, gid uuid, lim int default 40)
returns table (id uuid, channel_id uuid, channel_name text, author_id uuid, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pat text;
begin
  if not is_group_member(gid) then raise exception 'Not allowed'; end if;
  q := trim(coalesce(q, ''));
  if char_length(q) < 2 then return; end if;
  pat := '%' || replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select m.id, m.channel_id, c.name, m.author_id, m.content, m.created_at
    from messages m join channels c on c.id = m.channel_id
    where c.group_id = gid and m.content ilike pat
    order by m.created_at desc
    limit least(greatest(coalesce(lim, 40), 1), 100);
end $$;

-- ───────────── Notification settings per chat ─────────────
create table if not exists notif_prefs (
  user_id uuid not null references profiles(id) on delete cascade,
  target uuid not null,                         -- a group, channel or DM id
  kind text not null check (kind in ('group', 'channel', 'dm')),
  mode text not null default 'all' check (mode in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  primary key (user_id, target)
);
alter table notif_prefs enable row level security;
drop policy if exists "notif own" on notif_prefs;
create policy "notif own" on notif_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Moderation: timeouts, bulk delete, audit log ─────────────
alter table group_members add column if not exists timeout_until timestamptz;

create table if not exists group_audit (
  id bigint generated always as identity primary key,
  group_id uuid not null references groups(id) on delete cascade,
  actor uuid,
  target uuid,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists group_audit_idx on group_audit (group_id, created_at desc);
alter table group_audit enable row level security;
drop policy if exists "audit read" on group_audit;
create policy "audit read" on group_audit for select to authenticated using (is_group_founder(group_id) or has_perm(group_id, 'members'));

create or replace function audit_add(gid uuid, act text, tgt uuid, info text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = gid) then return; end if; -- the group itself is being deleted
  insert into group_audit(group_id, actor, target, action, detail) values (gid, auth.uid(), tgt, act, left(coalesce(info, ''), 200));
  if random() < 0.01 then delete from group_audit where created_at < now() - interval '180 days'; end if;
end $$;
revoke all on function audit_add(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function audit_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_add(new.group_id, 'join', new.user_id, '');
  elsif tg_op = 'DELETE' then
    perform audit_add(old.group_id, case when auth.uid() = old.user_id then 'leave' else 'remove' end, old.user_id, '');
  else
    if new.perms is distinct from old.perms then perform audit_add(new.group_id, 'perms', new.user_id, array_to_string(new.perms, ', ')); end if;
    if new.timeout_until is distinct from old.timeout_until then
      perform audit_add(new.group_id, case when new.timeout_until is null or new.timeout_until <= now() then 'untimeout' else 'timeout' end, new.user_id, coalesce(to_char(new.timeout_until at time zone 'utc', 'YYYY-MM-DD HH24:MI "UTC"'), ''));
    end if;
    if new.role is distinct from old.role then perform audit_add(new.group_id, 'role', new.user_id, new.role); end if;
  end if;
  return null;
end $$;
drop trigger if exists audit_members on group_members;
create trigger audit_members after insert or update or delete on group_members for each row execute function audit_members();

create or replace function audit_channels() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform audit_add(new.group_id, 'channel_create', null, new.name);
  elsif tg_op = 'DELETE' then perform audit_add(old.group_id, 'channel_delete', null, old.name);
  elsif new.name is distinct from old.name then perform audit_add(new.group_id, 'channel_rename', null, old.name || ' to ' || new.name);
  end if;
  return null;
end $$;
drop trigger if exists audit_channels on channels;
create trigger audit_channels after insert or update or delete on channels for each row execute function audit_channels();

create or replace function audit_groups() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then perform audit_add(new.id, 'group_rename', null, old.name || ' to ' || new.name); end if;
  return null;
end $$;
drop trigger if exists audit_groups on groups;
create trigger audit_groups after update on groups for each row execute function audit_groups();

create or replace function audit_message_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.channel_id is not null and auth.uid() is not null and auth.uid() <> old.author_id and coalesce(current_setting('nook.bulk', true), '') <> '1' then
    perform audit_add(channel_group(old.channel_id), 'message_delete', old.author_id, '');
  end if;
  return null;
end $$;
drop trigger if exists audit_message_delete on messages;
create trigger audit_message_delete after delete on messages for each row execute function audit_message_delete();

create or replace function timeout_member(gid uuid, uid uuid, minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_group_member(gid) and has_perm(gid, 'members')) then raise exception 'You need the members permission'; end if;
  if uid = auth.uid() then raise exception 'You cannot time yourself out'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = uid and role = 'member') then
    raise exception 'That person cannot be timed out';
  end if;
  if minutes is null or minutes <= 0 then
    update group_members set timeout_until = null where group_id = gid and user_id = uid;
  else
    update group_members set timeout_until = now() + make_interval(mins => least(minutes, 40320)) where group_id = gid and user_id = uid;
  end if;
end $$;

create or replace function bulk_delete_messages(gid uuid, uid uuid, hours int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (is_group_member(gid) and has_perm(gid, 'messages')) then raise exception 'You need the messages permission'; end if;
  if exists (select 1 from group_members where group_id = gid and user_id = uid and role = 'founder') and uid <> auth.uid() then
    raise exception 'The founder''s messages cannot be bulk deleted';
  end if;
  perform set_config('nook.bulk', '1', true); -- the single audit line below covers all of these
  with doomed as (
    select m.id from messages m join channels c on c.id = m.channel_id
    where c.group_id = gid and m.author_id = uid and m.created_at > now() - make_interval(hours => least(greatest(coalesce(hours, 1), 1), 720))
    order by m.created_at desc limit 1000
  ), gone as (delete from messages where id in (select id from doomed) returning 1)
  select count(*) into n from gone;
  perform audit_add(gid, 'bulk_delete', uid, n || ' messages');
  return n;
end $$;

create or replace function enforce_timeout() returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid; until timestamptz;
begin
  if new.channel_id is null then return new; end if;
  gid := channel_group(new.channel_id);
  select timeout_until into until from group_members where group_id = gid and user_id = new.author_id;
  if until is not null and until > now() then
    raise exception 'You are timed out in this group until %.', to_char(until at time zone 'utc', 'HH24:MI "UTC" on DD Mon');
  end if;
  return new;
end $$;
drop trigger if exists messages_timeout on messages;
create trigger messages_timeout before insert on messages for each row execute function enforce_timeout();

-- ───────────── Web push subscriptions ─────────────
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  ua text not null default '' check (char_length(ua) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists push_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
drop policy if exists "push own" on push_subscriptions;
create policy "push own" on push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Client error log (visible to staff) ─────────────
create table if not exists client_errors (
  id bigint generated always as identity primary key,
  user_id uuid,
  message text not null,
  stack text not null default '',
  page text not null default '',
  ua text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists client_errors_idx on client_errors (created_at desc);
alter table client_errors enable row level security; -- only the functions below read or write it

create or replace function log_client_error(msg text, stack_in text, page_in text, ua_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform hit('error', 20, interval '1 hour');
  insert into client_errors(user_id, message, stack, page, ua)
    values (auth.uid(), left(coalesce(msg, ''), 300), left(coalesce(stack_in, ''), 2000), left(coalesce(page_in, ''), 200), left(coalesce(ua_in, ''), 200));
  if random() < 0.02 then delete from client_errors where created_at < now() - interval '30 days'; end if;
end $$;

create or replace function admin_client_errors(lim int default 100)
returns table (message text, times bigint, last_seen timestamptz, stack text, page text, users bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select e.message, count(*), max(e.created_at), (array_agg(e.stack order by e.created_at desc))[1], (array_agg(e.page order by e.created_at desc))[1], count(distinct e.user_id)
    from client_errors e group by e.message order by max(e.created_at) desc limit least(greatest(coalesce(lim, 100), 1), 300);
end $$;

create or replace function admin_clear_client_errors() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  delete from client_errors;
  perform log_admin('clear_errors', '', '');
end $$;

grant execute on function set_pin(uuid, boolean), search_messages(text, uuid, int), timeout_member(uuid, uuid, int),
  bulk_delete_messages(uuid, uuid, int), log_client_error(text, text, text, text), admin_client_errors(int), admin_clear_client_errors(),
  join_group(text) to authenticated;
