-- Update 34: better polls. Pick-many polls, polls that end, anonymous polls, who voted, ending a poll early.
-- Safe to run more than once. Run it in the Supabase SQL editor after update_v33.sql.

-- A person can now have several votes on one poll (one per option).
alter table poll_votes drop constraint if exists poll_votes_pkey;
alter table poll_votes add primary key (message_id, user_id, opt);

-- Reads the poll settings out of the message text: { q, o: [...], m: multiple, e: ends at, a: anonymous }
create or replace function poll_info(mid uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t text;
begin
  select content into t from messages where id = mid;
  if t is null or left(t, 6) <> '<poll>' then raise exception 'That is not a poll'; end if;
  return substr(t, 7)::jsonb;
exception when invalid_text_representation then raise exception 'That is not a poll';
end $$;

-- Vote. Pick-one polls replace your vote; pick-many polls toggle the option. o = null clears your votes.
create or replace function poll_toggle(mid uuid, o int) returns void
language plpgsql set search_path = public as $$
declare info jsonb; n int; ends timestamptz; multi boolean; have int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('vote', 60, interval '1 minute');
  if not exists (select 1 from messages m where m.id = mid) then raise exception 'That poll is not available'; end if;
  info := poll_info(mid);
  n := jsonb_array_length(info->'o');
  multi := coalesce((info->>'m')::boolean, false);
  begin ends := (info->>'e')::timestamptz; exception when others then ends := null; end;
  if ends is not null and ends <= now() then raise exception 'This poll has ended'; end if;
  if o is null then delete from poll_votes where message_id = mid and user_id = auth.uid(); return; end if;
  if o < 0 or o >= n then raise exception 'That option does not exist'; end if;
  if multi then
    delete from poll_votes where message_id = mid and user_id = auth.uid() and opt = o;
    if not found then insert into poll_votes(message_id, user_id, opt) values (mid, auth.uid(), o); end if;
  else
    select count(*) into have from poll_votes where message_id = mid and user_id = auth.uid() and opt = o;
    delete from poll_votes where message_id = mid and user_id = auth.uid();
    if have = 0 then insert into poll_votes(message_id, user_id, opt) values (mid, auth.uid(), o); end if;
  end if;
end $$;

-- Old name still works for single choice.
create or replace function poll_vote(mid uuid, o int) returns void
language plpgsql set search_path = public as $$
begin
  if o is null then perform poll_toggle(mid, null); return; end if;
  delete from poll_votes where message_id = mid and user_id = auth.uid() and opt <> o;
  if not exists (select 1 from poll_votes where message_id = mid and user_id = auth.uid() and opt = o) then perform poll_toggle(mid, o); end if;
end $$;

drop function if exists poll_results(uuid[]);
create or replace function poll_results(ids uuid[]) returns table (message_id uuid, opt smallint, n bigint, mine boolean, voters bigint)
language sql stable set search_path = public as $$
  select v.message_id, v.opt, count(*), bool_or(v.user_id = auth.uid()),
         (select count(distinct x.user_id) from poll_votes x where x.message_id = v.message_id)
  from poll_votes v where v.message_id = any(ids) group by v.message_id, v.opt
$$;

-- Who voted for what (empty for anonymous polls).
create or replace function poll_voters(mid uuid) returns table (opt smallint, user_id uuid)
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from messages m where m.id = mid) then return; end if;
  if coalesce((poll_info(mid)->>'a')::boolean, false) then return; end if;
  return query select v.opt, v.user_id from poll_votes v where v.message_id = mid order by v.voted_at limit 200;
end $$;

-- The person who posted the poll can end it now.
create or replace function poll_close(mid uuid) returns void
language plpgsql set search_path = public as $$
declare info jsonb;
begin
  if not exists (select 1 from messages m where m.id = mid and m.author_id = auth.uid()) then raise exception 'Only the person who posted the poll can end it'; end if;
  info := poll_info(mid);
  update messages set content = '<poll>' || (info || jsonb_build_object('e', now()))::text where id = mid;
end $$;

grant execute on function poll_info(uuid), poll_toggle(uuid, int), poll_vote(uuid, int), poll_results(uuid[]), poll_voters(uuid), poll_close(uuid) to authenticated;
