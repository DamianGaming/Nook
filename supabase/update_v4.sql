-- Run once in the Supabase SQL editor (after update_v3.sql). Safe to re-run.
-- Adds what voice/video calls need: DM ringing and "who is in this voice channel".

-- ───────────── DM call invites (the "ringing" part) ─────────────
create table if not exists call_invites (
  id uuid primary key default gen_random_uuid(),
  dm_id uuid not null references dms(id) on delete cascade,
  caller uuid not null references profiles(id) on delete cascade,
  callee uuid not null references profiles(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table call_invites enable row level security;

drop policy if exists "invites read" on call_invites;
drop policy if exists "invites insert" on call_invites;
drop policy if exists "invites update" on call_invites;
create policy "invites read" on call_invites for select to authenticated
  using (auth.uid() in (caller, callee));
create policy "invites insert" on call_invites for insert to authenticated
  with check (
    caller = auth.uid()
    and callee <> auth.uid()
    and exists (select 1 from dms d where d.id = dm_id and caller in (d.user_a, d.user_b) and callee in (d.user_a, d.user_b))
    and not is_blocked_between(caller, callee)
  );
create policy "invites update" on call_invites for update to authenticated
  using (auth.uid() in (caller, callee)) with check (auth.uid() in (caller, callee));

-- Only the status may ever change
create or replace function invites_status_only() returns trigger
language plpgsql as $$
begin
  if new.dm_id <> old.dm_id or new.caller <> old.caller or new.callee <> old.callee or new.created_at <> old.created_at then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;
drop trigger if exists invites_status_only on call_invites;
create trigger invites_status_only before update on call_invites for each row execute function invites_status_only();

-- Housekeeping and anti-harassment: tidy old rows, and at most one call attempt every 5 seconds
create or replace function invites_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from call_invites where created_at < now() - interval '1 hour';
  if exists (select 1 from call_invites where caller = new.caller and created_at > now() - interval '5 seconds') then
    raise exception 'Please wait a moment before calling again.';
  end if;
  return new;
end $$;
drop trigger if exists invites_before_insert on call_invites;
create trigger invites_before_insert before insert on call_invites for each row execute function invites_before_insert();

-- ───────────── Who is in a voice channel ─────────────
create table if not exists voice_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table voice_members enable row level security;

drop policy if exists "voice read" on voice_members;
drop policy if exists "voice insert" on voice_members;
drop policy if exists "voice update" on voice_members;
drop policy if exists "voice delete" on voice_members;
create policy "voice read" on voice_members for select to authenticated
  using (is_group_member(channel_group(channel_id)));
create policy "voice insert" on voice_members for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(channel_group(channel_id)));
create policy "voice update" on voice_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "voice delete" on voice_members for delete to authenticated
  using (user_id = auth.uid());

-- Clients send a heartbeat every ~25 s; the server clock decides what is fresh
create or replace function voice_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    delete from voice_members where updated_at < now() - interval '5 minutes';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists voice_touch on voice_members;
create trigger voice_touch before insert or update on voice_members for each row execute function voice_touch();

create or replace function voice_roster(cids uuid[]) returns table (channel_id uuid, user_id uuid)
language sql security definer stable set search_path = public as $$
  select v.channel_id, v.user_id
  from voice_members v
  where v.channel_id = any(cids)
    and v.updated_at > now() - interval '70 seconds'
    and is_group_member(channel_group(v.channel_id))
$$;

-- ───────────── Realtime ─────────────
do $$
declare t text;
begin
  foreach t in array array['call_invites', 'voice_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
