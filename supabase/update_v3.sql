-- Run once in the Supabase SQL editor (after schema.sql, fix_profiles.sql, update_media.sql).
-- Adds: image attachments, replies, reactions, unread tracking, username changes,
-- invite regeneration and account deletion.

-- ───────────── Attachments and replies ─────────────
alter table messages add column if not exists attachment_url text;
alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;

-- Replace the old "content must be 1+ chars" rule so image-only messages are allowed
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.messages'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%char_length(content)%'
  loop
    execute format('alter table messages drop constraint %I', c.conname);
  end loop;
end $$;
alter table messages drop constraint if exists messages_attachment_check;
alter table messages drop constraint if exists messages_content_rule;
alter table messages add constraint messages_content_rule
  check (char_length(content) <= 2000 and (char_length(content) >= 1 or attachment_url is not null));
alter table messages add constraint messages_attachment_check
  check (attachment_url is null or (char_length(attachment_url) <= 500 and attachment_url like '%/storage/v1/object/public/media/%'));

-- ───────────── Reactions ─────────────
create table if not exists reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('heart', 'like', 'smile', 'star')),
  primary key (message_id, user_id, kind)
);
alter table reactions enable row level security;
drop policy if exists "reactions read" on reactions;
drop policy if exists "reactions add" on reactions;
drop policy if exists "reactions remove" on reactions;
create policy "reactions read" on reactions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id));
create policy "reactions add" on reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id));
create policy "reactions remove" on reactions for delete to authenticated using (user_id = auth.uid());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions') then
    alter publication supabase_realtime add table reactions;
  end if;
end $$;

-- ───────────── Unread tracking ─────────────
create table if not exists read_states (
  user_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null,
  last_read timestamptz not null default now(),
  primary key (user_id, target_id)
);
alter table read_states enable row level security;
drop policy if exists "read_states own" on read_states;
create policy "read_states own" on read_states for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function mark_read(target uuid) returns void
language sql security definer set search_path = public as $$
  insert into read_states (user_id, target_id, last_read) values (auth.uid(), target, now())
  on conflict (user_id, target_id) do update set last_read = now();
$$;

create or replace function unread_counts() returns table (target_id uuid, group_id uuid, unread bigint)
language sql security definer stable set search_path = public as $$
  with mine as (
    select c.id as tid, c.group_id as gid, 'c'::text as k, gm.joined_at as since
      from channels c join group_members gm on gm.group_id = c.group_id and gm.user_id = auth.uid()
    union all
    select d.id, null::uuid, 'd', d.created_at from dms d where auth.uid() in (d.user_a, d.user_b)
  )
  select mine.tid, mine.gid, count(m.id)
  from mine
  left join read_states rs on rs.user_id = auth.uid() and rs.target_id = mine.tid
  join messages m
    on ((mine.k = 'c' and m.channel_id = mine.tid) or (mine.k = 'd' and m.dm_id = mine.tid))
   and m.author_id <> auth.uid()
   and m.created_at > coalesce(rs.last_read, mine.since)
  group by mine.tid, mine.gid
$$;

-- ───────────── Username changes (once every 14 days) ─────────────
alter table profiles add column if not exists username_changed_at timestamptz;
create or replace function limit_username_change() returns trigger
language plpgsql as $$
begin
  if new.username <> old.username then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '14 days' then
      raise exception 'You can only change your username once every 14 days.';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_username_limit on profiles;
create trigger profiles_username_limit before update on profiles for each row execute function limit_username_change();

-- ───────────── Founder tools ─────────────
create or replace function regenerate_invite(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_group_founder(gid) then raise exception 'Only the founder can do this'; end if;
  update groups set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    where id = gid returning invite_code into code;
  return code;
end $$;

-- ───────────── Delete my account (privacy / GDPR) ─────────────
alter table groups drop constraint if exists groups_created_by_fkey;
alter table groups alter column created_by drop not null;
alter table groups add constraint groups_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare g record; nxt uuid;
begin
  for g in select group_id from group_members where user_id = auth.uid() and role = 'founder' loop
    select user_id into nxt from group_members
      where group_id = g.group_id and user_id <> auth.uid() order by joined_at limit 1;
    if nxt is null then
      delete from groups where id = g.group_id;
    else
      update group_members set role = 'founder' where group_id = g.group_id and user_id = nxt;
    end if;
  end loop;
  delete from auth.users where id = auth.uid();
end $$;
