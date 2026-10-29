-- Nook database schema for Supabase (run in the SQL editor)
-- Concept: no servers. Just private DMs and group chats with categories + channels.
-- Groups have a "founder" (full control + a few extra powers) but everyone else is equal.

create extension if not exists "pgcrypto";

-- ───────────── Profiles ─────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 32),
  bio text not null default '' check (char_length(bio) <= 200),
  pronouns text not null default '' check (char_length(pronouns) <= 20),
  accent_color text not null default '#7c8cff' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  banner_color text not null default '#3b4270' check (banner_color ~ '^#[0-9a-fA-F]{6}$'),
  avatar_emoji text not null default '🙂' check (char_length(avatar_emoji) <= 8),
  status text not null default 'online' check (status in ('online','idle','dnd','invisible')),
  status_text text not null default '' check (char_length(status_text) <= 60),
  created_at timestamptz not null default now()
);

-- ───────────── Groups ─────────────
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  icon_emoji text not null default '💬',
  invite_code text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,10),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('founder','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  position int not null default 0
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null check (name ~ '^[a-z0-9-]{1,30}$'),
  topic text not null default '' check (char_length(topic) <= 120),
  position int not null default 0
);

-- ───────────── DMs ─────────────
create table if not exists dms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

-- ───────────── Messages ─────────────
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  dm_id uuid references dms(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  check ((channel_id is null) <> (dm_id is null))
);
create index if not exists messages_channel_idx on messages(channel_id, created_at desc);
create index if not exists messages_dm_idx on messages(dm_id, created_at desc);

-- ───────────── Safety ─────────────
create table if not exists blocks (
  blocker uuid references profiles(id) on delete cascade,
  blocked uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references profiles(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  reported_user uuid references profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  message_snapshot text,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- ───────────── Helper functions (security definer avoids RLS recursion) ─────────────
create or replace function is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function is_group_founder(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'founder');
$$;

create or replace function is_dm_member(did uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from dms where id = did and auth.uid() in (user_a, user_b));
$$;

create or replace function channel_group(cid uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select group_id from channels where id = cid;
$$;

create or replace function is_blocked_between(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- ───────────── Row level security ─────────────
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table categories enable row level security;
alter table channels enable row level security;
alter table dms enable row level security;
alter table messages enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;

-- profiles: any signed-in user can read; only you can edit your own
create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles insert own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on profiles for update to authenticated using (id = auth.uid());

-- groups: members read; founder edits/deletes. Creation goes through create_group().
create policy "groups read" on groups for select to authenticated using (is_group_member(id));
create policy "groups update" on groups for update to authenticated using (is_group_founder(id));
create policy "groups delete" on groups for delete to authenticated using (is_group_founder(id));

-- members: members see each other; you can leave; founder can remove people
create policy "members read" on group_members for select to authenticated using (is_group_member(group_id));
create policy "members leave or remove" on group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_founder(group_id));

-- categories / channels: members read, founder manages
create policy "categories read" on categories for select to authenticated using (is_group_member(group_id));
create policy "categories write" on categories for all to authenticated
  using (is_group_founder(group_id)) with check (is_group_founder(group_id));
create policy "channels read" on channels for select to authenticated using (is_group_member(group_id));
create policy "channels write" on channels for all to authenticated
  using (is_group_founder(group_id)) with check (is_group_founder(group_id));

-- dms: only the two people
create policy "dms read" on dms for select to authenticated using (auth.uid() in (user_a, user_b));

-- messages
create policy "messages read" on messages for select to authenticated using (
  (channel_id is not null and is_group_member(channel_group(channel_id)))
  or (dm_id is not null and is_dm_member(dm_id))
);
create policy "messages insert" on messages for insert to authenticated with check (
  author_id = auth.uid() and (
    (channel_id is not null and is_group_member(channel_group(channel_id)))
    or (dm_id is not null and is_dm_member(dm_id) and not exists (
      select 1 from dms d where d.id = dm_id and is_blocked_between(d.user_a, d.user_b)))
  )
);
create policy "messages edit own" on messages for update to authenticated using (author_id = auth.uid());
create policy "messages delete own or founder" on messages for delete to authenticated using (
  author_id = auth.uid()
  or (channel_id is not null and is_group_founder(channel_group(channel_id)))
);

-- blocks: private to the blocker
create policy "blocks own" on blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

-- reports: you can file and see your own; nobody else can read them (review in the Supabase dashboard)
create policy "reports insert" on reports for insert to authenticated with check (reporter = auth.uid());
create policy "reports read own" on reports for select to authenticated using (reporter = auth.uid());

-- ───────────── Anti-spam: max 8 messages per 10 seconds per user ─────────────
create or replace function rate_limit_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'You are sending messages too fast. Slow down a little.';
  end if;
  return new;
end $$;
drop trigger if exists messages_rate_limit on messages;
create trigger messages_rate_limit before insert on messages for each row execute function rate_limit_messages();

-- ───────────── RPCs ─────────────
create or replace function create_group(group_name text, emoji text default '💬') returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; cat uuid;
begin
  insert into groups(name, icon_emoji, created_by) values (group_name, emoji, auth.uid()) returning id into gid;
  insert into group_members(group_id, user_id, role) values (gid, auth.uid(), 'founder');
  insert into categories(group_id, name, position) values (gid, 'General', 0) returning id into cat;
  insert into channels(group_id, category_id, name, position) values (gid, cat, 'general', 0);
  return gid;
end $$;

create or replace function join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from groups where invite_code = code;
  if gid is null then raise exception 'Invalid invite code'; end if;
  insert into group_members(group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

create or replace function start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; did uuid;
begin
  if other = auth.uid() then raise exception 'You cannot DM yourself'; end if;
  if is_blocked_between(auth.uid(), other) then raise exception 'You cannot message this user'; end if;
  a := least(auth.uid(), other); b := greatest(auth.uid(), other);
  select id into did from dms where user_a = a and user_b = b;
  if did is null then insert into dms(user_a, user_b) values (a, b) returning id into did; end if;
  return did;
end $$;

-- Founder can hand the role to someone else (the "not really an owner" part: it's just a role that can be passed on)
create or replace function transfer_founder(gid uuid, new_founder uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_founder(gid) then raise exception 'Only the founder can do this'; end if;
  update group_members set role = 'member' where group_id = gid and user_id = auth.uid();
  update group_members set role = 'founder' where group_id = gid and user_id = new_founder;
end $$;

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table channels;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table group_members;
