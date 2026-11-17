-- Nook v22: shared music queue for calls. Safe to run more than once.
-- Everyone in a call (group voice room or DM call) sees the same queue and hears the same song at the same moment.
-- The songs themselves are NOT stored or streamed by Nook: the queue holds a YouTube video id or a direct audio link,
-- and each person's own device plays it. "Mute" on the music panel only mutes it for you.

create table if not exists music_items (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  room uuid not null,                                   -- a group id or a DM id
  room_kind text not null check (room_kind in ('group', 'dm')),
  added_by uuid references profiles(id) on delete set null,
  source text not null check (source in ('youtube', 'audio')),
  ref text not null check (char_length(ref) between 1 and 500),
  title text not null default '' check (char_length(title) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists music_items_room_idx on music_items (room, seq);
alter table music_items replica identity full;

create table if not exists music_state (
  room uuid primary key,
  current_item uuid references music_items(id) on delete set null,
  started_at timestamptz,
  updated_by uuid
);
alter table music_items enable row level security;
alter table music_state enable row level security;

create or replace function music_can(r uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when k = 'group' then is_group_member(r)
    when k = 'dm' then exists (select 1 from dms d where d.id = r and auth.uid() in (d.user_a, d.user_b))
    else false end
$$;

drop policy if exists "music items read" on music_items;
create policy "music items read" on music_items for select to authenticated using (music_can(room, room_kind));
drop policy if exists "music state read" on music_state;
create policy "music state read" on music_state for select to authenticated using (
  music_can(room, 'group') or music_can(room, 'dm')
);
-- No insert / update / delete policies: everything goes through the functions below.

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'music_items') then
    alter publication supabase_realtime add table music_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'music_state') then
    alter publication supabase_realtime add table music_state;
  end if;
end $$;

-- Moves on to the next song (or stops when the queue is empty). Caller holds the lock on the state row.
create or replace function music_advance(r uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur uuid; nxt uuid;
begin
  select current_item into cur from music_state where room = r for update;
  if cur is not null then delete from music_items where id = cur; end if;
  select id into nxt from music_items where room = r order by seq limit 1;
  insert into music_state(room, current_item, started_at, updated_by)
    values (r, nxt, case when nxt is null then null else now() end, auth.uid())
  on conflict (room) do update set current_item = excluded.current_item, started_at = excluded.started_at, updated_by = excluded.updated_by;
end $$;
revoke all on function music_advance(uuid) from public, anon, authenticated;

-- Adds songs (one, or a whole playlist). items = [{source, ref, title}, ...]
create or replace function music_add(r uuid, k text, items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0; total int; cur uuid; src text; rf text;
begin
  if not music_can(r, k) then raise exception 'You are not in this conversation'; end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then raise exception 'Nothing to add'; end if;
  if jsonb_array_length(items) > 50 then raise exception 'Add up to 50 songs at a time'; end if;
  perform hit('music', 12, interval '1 minute');
  perform pg_advisory_xact_lock(hashtext(r::text));
  select count(*) into total from music_items where room = r;
  if total + jsonb_array_length(items) > 100 then raise exception 'The queue is full (100 songs). Let some play first.'; end if;
  for it in select * from jsonb_array_elements(items) loop
    src := it ->> 'source'; rf := btrim(coalesce(it ->> 'ref', ''));
    if src = 'youtube' and rf !~ '^[A-Za-z0-9_-]{11}$' then continue; end if;
    if src = 'audio' and (rf !~ '^https://[^ ]+$' or char_length(rf) > 500) then continue; end if;
    if src not in ('youtube', 'audio') then continue; end if;
    insert into music_items(room, room_kind, added_by, source, ref, title)
      values (r, k, auth.uid(), src, rf, left(btrim(coalesce(it ->> 'title', '')), 200));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Those links cannot be played'; end if;
  select current_item into cur from music_state where room = r;
  if cur is null then
    insert into music_state(room, current_item, started_at, updated_by)
      values (r, (select id from music_items where room = r order by seq limit 1), now(), auth.uid())
    on conflict (room) do update set current_item = excluded.current_item, started_at = excluded.started_at, updated_by = excluded.updated_by;
  end if;
  return n;
end $$;

-- Song finished, or someone pressed skip. Passing the id of the song that finished makes this safe when
-- everyone's device reports the end at once: only the first call moves on.
create or replace function music_next(r uuid, k text, finished uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  if not music_can(r, k) then raise exception 'You are not in this conversation'; end if;
  perform pg_advisory_xact_lock(hashtext(r::text));
  select current_item into cur from music_state where room = r;
  if finished is not null and cur is distinct from finished then return; end if;
  perform music_advance(r);
end $$;

-- Remove one song: its adder, a group founder / someone with the channels permission, or either person in a DM.
create or replace function music_remove(item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m music_items; cur uuid;
begin
  select * into m from music_items where id = item;
  if not found then return; end if;
  if not music_can(m.room, m.room_kind) then raise exception 'You are not in this conversation'; end if;
  if not (m.added_by = auth.uid() or m.room_kind = 'dm' or is_group_founder(m.room) or has_perm(m.room, 'channels')) then
    raise exception 'Only the person who added it, or a group manager, can remove this';
  end if;
  perform pg_advisory_xact_lock(hashtext(m.room::text));
  select current_item into cur from music_state where room = m.room;
  if cur = item then perform music_advance(m.room); else delete from music_items where id = item; end if;
end $$;

-- Clear the whole queue (founder / channels permission in a group, anyone in a DM).
create or replace function music_clear(r uuid, k text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not music_can(r, k) then raise exception 'You are not in this conversation'; end if;
  if k = 'group' and not (is_group_founder(r) or has_perm(r, 'channels')) then raise exception 'Only a group manager can clear the queue'; end if;
  perform pg_advisory_xact_lock(hashtext(r::text));
  update music_state set current_item = null, started_at = null, updated_by = auth.uid() where room = r;
  delete from music_items where room = r;
end $$;

-- Everything a device needs to start playing in step: the queue, what is playing, and the server's clock.
create or replace function music_get(r uuid, k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st music_state;
begin
  if not music_can(r, k) then raise exception 'You are not in this conversation'; end if;
  select * into st from music_state where room = r;
  return jsonb_build_object(
    'now', now(),
    'current', st.current_item,
    'started_at', st.started_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'source', i.source, 'ref', i.ref, 'title', i.title, 'added_by', i.added_by) order by i.seq) from music_items i where i.room = r), '[]'::jsonb)
  );
end $$;

grant execute on function music_can(uuid, text), music_add(uuid, text, jsonb), music_next(uuid, text, uuid), music_remove(uuid), music_clear(uuid, text), music_get(uuid, text) to authenticated;

-- Clean up when a group or DM goes away.
create or replace function music_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from music_state where room = old.id;
  delete from music_items where room = old.id;
  return old;
end $$;
drop trigger if exists groups_music_cleanup on groups;
create trigger groups_music_cleanup before delete on groups for each row execute function music_cleanup();
drop trigger if exists dms_music_cleanup on dms;
create trigger dms_music_cleanup before delete on dms for each row execute function music_cleanup();
