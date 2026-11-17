-- Update 32: bot replies to slash commands show "<person> used /command" above them, like Discord.
-- Safe to run more than once. Run it in the Supabase SQL editor after update_v31.sql.

alter table messages add column if not exists via_user uuid references profiles(id) on delete set null;
alter table messages add column if not exists via_name text;

-- Only bot_respond may set these two columns, so nobody can fake a "used /command" line.
create or replace function messages_via_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('nook.via', true), '') <> '1' then
    new.via_user := null;
    new.via_name := null;
  end if;
  return new;
end $$;
drop trigger if exists messages_via on messages;
create trigger messages_via before insert or update of via_user, via_name on messages for each row execute function messages_via_guard();

create or replace function bot_respond(token text, interaction uuid, content text, hidden boolean default false, mode text default 'reply') returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); i record; mid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'send', 60, interval '1 minute');
  if char_length(coalesce(content, '')) not between 1 and 2000 then raise exception 'Messages must be 1 to 2000 characters'; end if;
  select * into i from interactions x where x.id = interaction and x.bot_id = bid;
  if i.id is null then raise exception 'That interaction is not for this bot'; end if;
  if i.created_at < now() - interval '15 minutes' then raise exception 'That interaction has expired (answer within 15 minutes)'; end if;
  if mode = 'update' then
    if i.message_id is null then raise exception 'Only button and menu presses can update a message'; end if;
    update messages set content = bot_respond.content, edited_at = now() where messages.id = i.message_id and author_id = bid;
    return i.message_id;
  end if;
  if hidden then
    if (select count(*) from ephemeral_messages e where e.user_id = i.user_id and e.channel_id = i.channel_id) >= 20 then
      delete from ephemeral_messages e where e.id in (select id from ephemeral_messages where user_id = i.user_id and channel_id = i.channel_id order by created_at limit 5);
    end if;
    insert into ephemeral_messages(channel_id, user_id, bot_id, content) values (i.channel_id, i.user_id, bid, content) returning id into mid;
    return mid;
  end if;
  perform set_config('nook.via', '1', true);
  if i.kind = 'command' then
    insert into messages(channel_id, author_id, content, via_user, via_name) values (i.channel_id, bid, content, i.user_id, left(i.name, 40)) returning id into mid;
  else
    insert into messages(channel_id, author_id, content) values (i.channel_id, bid, content) returning id into mid;
  end if;
  perform set_config('nook.via', '', true);
  return mid;
end $$;
grant execute on function bot_respond(text, uuid, text, boolean, text) to anon, authenticated;
