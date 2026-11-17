-- Nook v7: friends. People add each other, and accepted friends get a private chat.
-- Safe to re-run.

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references profiles(id) on delete cascade,
  addressee uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on friendships (addressee);
alter table friendships enable row level security;

drop policy if exists "friends read" on friendships;
drop policy if exists "friends delete" on friendships;
create policy "friends read" on friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "friends delete" on friendships for delete to authenticated using (auth.uid() in (requester, addressee));
-- There is no insert or update policy on purpose: requests go through the functions below, so nobody can fake one.

-- Send a request by username. If they already asked you, this accepts it.
create or replace function send_friend_request(uname text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid; f friendships; a uuid; b uuid; did uuid;
begin
  select id into target from profiles where username = lower(trim(uname));
  if target is null then raise exception 'No one with that username'; end if;
  if target = auth.uid() then raise exception 'That is you'; end if;
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

-- Accept or decline a request sent to you. Accepting opens your private chat and returns its id.
create or replace function respond_friend_request(fid uuid, accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare f friendships; a uuid; b uuid; did uuid;
begin
  select * into f from friendships where id = fid and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'That request is no longer there'; end if;
  if not accept then delete from friendships where id = fid; return null; end if;
  if is_blocked_between(f.requester, f.addressee) then delete from friendships where id = fid; raise exception 'You cannot add this person'; end if;
  update friendships set status = 'accepted' where id = fid;
  a := least(f.requester, f.addressee); b := greatest(f.requester, f.addressee);
  select id into did from dms where user_a = a and user_b = b;
  if did is null then insert into dms(user_a, user_b) values (a, b) returning id into did; end if;
  return did;
end $$;

-- Blocking someone also ends the friendship
create or replace function blocks_end_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships
    where least(requester, addressee) = least(new.blocker, new.blocked) and greatest(requester, addressee) = greatest(new.blocker, new.blocked);
  return new;
end $$;
drop trigger if exists blocks_end_friendship on blocks;
create trigger blocks_end_friendship after insert on blocks for each row execute function blocks_end_friendship();

-- Everyone who already has a private chat counts as friends, so nothing disappears
insert into friendships (requester, addressee, status)
  select user_a, user_b, 'accepted' from dms
  on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
    alter publication supabase_realtime add table friendships;
  end if;
end $$;
