-- v37: bots can send direct messages to people they share a group with.
create or replace function bot_dm(token text, target uuid, content text) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); did uuid; mid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'dm', 20, interval '1 minute');
  content := coalesce(content, '');
  if char_length(content) < 1 or char_length(content) > 2000 then raise exception 'Messages must be 1 to 2000 characters'; end if;
  if target is null or target = bid or not exists (select 1 from profiles where id = target) then raise exception 'Unknown user'; end if;
  if exists (select 1 from profiles where id = target and is_bot) then raise exception 'Bots cannot message bots'; end if;
  if not exists (select 1 from group_members a join group_members b on a.group_id = b.group_id where a.user_id = bid and b.user_id = target) then
    raise exception 'The bot shares no group with that user';
  end if;
  if is_blocked_between(bid, target) then raise exception 'That user cannot receive messages from this bot'; end if;
  select id into did from dms where user_a = least(bid, target) and user_b = greatest(bid, target);
  if did is null then
    insert into dms(user_a, user_b) values (least(bid, target), greatest(bid, target)) returning id into did;
  end if;
  insert into messages(dm_id, author_id, content) values (did, bid, content) returning id into mid;
  return mid;
end $$;
grant execute on function bot_dm(text, uuid, text) to anon, authenticated;

-- Typing indicator for bots: a short-lived row that members of the group see through Realtime.
create table if not exists bot_typing (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  bot_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists bot_typing_channel on bot_typing(channel_id, created_at);
alter table bot_typing enable row level security;
drop policy if exists bot_typing_read on bot_typing;
create policy bot_typing_read on bot_typing for select to authenticated
  using (exists (select 1 from channels c join group_members gm on gm.group_id = c.group_id where c.id = bot_typing.channel_id and gm.user_id = auth.uid()));
do $$ begin
  alter publication supabase_realtime add table bot_typing;
exception when others then null;
end $$;

create or replace function bot_typing(token text, channel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); gid uuid;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'typing', 30, interval '1 minute');
  select group_id into gid from channels where id = channel;
  if gid is null or not exists (select 1 from group_members where group_id = gid and user_id = bid) then raise exception 'The bot is not in that channel''s group'; end if;
  delete from bot_typing where created_at < now() - interval '1 minute';
  insert into bot_typing(channel_id, bot_id) values (channel, bid);
end $$;
grant execute on function bot_typing(text, uuid) to anon, authenticated;


-- ───────────── Message commands: bots add actions to the menu on any message ─────────────
alter table bot_commands add column if not exists target text not null default 'chat';
alter table bot_commands drop constraint if exists bot_commands_target_check;
alter table bot_commands add constraint bot_commands_target_check check (target in ('chat', 'message'));

create or replace function bot_register_commands(token text, cmds jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); c jsonb; o jsonb; ch jsonb; n int := 0; seen text[] := '{}';
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'register', 10, interval '1 minute');
  if cmds is null or jsonb_typeof(cmds) <> 'array' then raise exception 'Commands must be a list'; end if;
  if jsonb_array_length(cmds) > 200 then raise exception 'A bot can have up to 200 slash commands'; end if;
  for c in select * from jsonb_array_elements(cmds) loop
    if coalesce(c->>'name', '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Command names use lowercase letters, numbers, - and _ (1 to 32 characters): %', c->>'name'; end if;
    if (c->>'name') = any(seen) then raise exception 'Two commands are called %', c->>'name'; end if;
    seen := seen || (c->>'name');
    if coalesce(c->>'target', 'chat') not in ('chat', 'message') then raise exception 'target must be chat or message'; end if;
    if c ? 'perm' and c->>'perm' is not null and c->>'perm' not in ('channels','messages','emoji','invites','members','customize') then raise exception 'perm must be one of channels, messages, emoji, invites, members, customize: %', c->>'perm'; end if;
    if char_length(coalesce(c->>'description', '')) not between 1 and 100 then raise exception 'Command % needs a description of 1 to 100 characters', c->>'name'; end if;
    if jsonb_typeof(coalesce(c->'options', '[]')) <> 'array' or jsonb_array_length(coalesce(c->'options', '[]')) > 10 then raise exception 'A command can have up to 10 options'; end if;
    for o in select * from jsonb_array_elements(coalesce(c->'options', '[]')) loop
      if coalesce(o->>'name', '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Option names use lowercase letters, numbers, - and _: %', o->>'name'; end if;
      if char_length(coalesce(o->>'description', '')) not between 1 and 100 then raise exception 'Option % needs a description of 1 to 100 characters', o->>'name'; end if;
      if coalesce(o->>'type', 'string') not in ('string', 'integer', 'number', 'boolean', 'user', 'channel') then raise exception 'Option type must be string, integer, number, boolean, user or channel'; end if;
      if o ? 'choices' then
        if jsonb_typeof(o->'choices') <> 'array' or jsonb_array_length(o->'choices') > 25 then raise exception 'An option can have up to 25 choices'; end if;
        for ch in select * from jsonb_array_elements(o->'choices') loop
          if char_length(coalesce(ch->>'name', '')) not between 1 and 60 or char_length(coalesce(ch->>'value', '')) not between 1 and 100 then raise exception 'Each choice needs a name (up to 60) and a value (up to 100)'; end if;
        end loop;
      end if;
    end loop;
  end loop;
  delete from bot_commands where bot_id = bid;
  for c in select * from jsonb_array_elements(cmds) loop
    insert into bot_commands(bot_id, name, description, options, perm, target) values (bid, c->>'name', c->>'description',
      coalesce((select jsonb_agg(jsonb_build_object('name', x->>'name', 'description', x->>'description', 'type', coalesce(x->>'type', 'string'),
        'required', coalesce((x->>'required')::boolean, false), 'choices', coalesce(x->'choices', '[]'::jsonb))) from jsonb_array_elements(coalesce(c->'options', '[]')) x), '[]'::jsonb), nullif(c->>'perm', ''), coalesce(c->>'target', 'chat'));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function group_slash_commands(gid uuid)
returns table (bot_id uuid, bot_username text, bot_name text, bot_avatar text, name text, description text, options jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(gid) then return; end if;
  return query select c.bot_id, p.username, p.display_name, p.avatar_url, c.name, c.description, c.options
    from bot_commands c join group_members m on m.user_id = c.bot_id and m.group_id = gid join profiles p on p.id = c.bot_id
    where c.target = 'chat' and (c.perm is null or has_perm(gid, c.perm))
    order by c.name, p.username;
end $$;

create or replace function invoke_command(channel uuid, bot uuid, cmd text, opts jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; req text; tg text; def jsonb; o jsonb; v jsonb; clean jsonb := '{}'; iid uuid; t text; s text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('slash', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = bot) then raise exception 'That bot is not in this group'; end if;
  select options, perm, target into def, req, tg from bot_commands where bot_id = bot and name = lower(cmd);
  if def is null then raise exception 'That command does not exist any more'; end if;
  if tg = 'message' then raise exception 'That command is used from a message''s menu'; end if;
  if req is not null and not has_perm(gid, req) then raise exception 'You need the "%" permission in this group to use that command', req; end if;
  opts := coalesce(opts, '{}');
  if jsonb_typeof(opts) <> 'object' then raise exception 'Options must be an object'; end if;
  for o in select * from jsonb_array_elements(def) loop
    v := opts -> (o->>'name'); t := o->>'type';
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      if (o->>'required')::boolean then raise exception 'Fill in "%"', o->>'name'; end if;
      continue;
    end if;
    s := v #>> '{}';
    if char_length(s) > 1000 then raise exception '"%" is too long', o->>'name'; end if;
    if t = 'integer' and s !~ '^-?[0-9]{1,15}$' then raise exception '"%" must be a whole number', o->>'name'; end if;
    if t = 'number' and s !~ '^-?[0-9]{1,15}(\.[0-9]{1,10})?$' then raise exception '"%" must be a number', o->>'name'; end if;
    if t = 'boolean' and s not in ('true', 'false') then raise exception '"%" must be yes or no', o->>'name'; end if;
    if t = 'user' and not exists (select 1 from profiles p join group_members gm on gm.user_id = p.id where gm.group_id = gid and p.username = lower(s)) then raise exception 'Nobody called "%" is in this group', s; end if;
    if t = 'channel' and not exists (select 1 from channels c where c.group_id = gid and c.name = lower(s)) then raise exception 'There is no channel called "%"', s; end if;
    if jsonb_array_length(coalesce(o->'choices', '[]')) > 0 and not exists (select 1 from jsonb_array_elements(o->'choices') ch where ch->>'value' = s) then raise exception '"%" must be one of the listed choices', o->>'name'; end if;
    clean := clean || jsonb_build_object(o->>'name', case t when 'integer' then to_jsonb(s::bigint) when 'number' then to_jsonb(s::numeric) when 'boolean' then to_jsonb(s::boolean) else to_jsonb(case when t in ('user', 'channel') then lower(s) else s end) end);
  end loop;
  if random() < 0.05 then
    delete from interactions where created_at < now() - interval '1 day';
    delete from ephemeral_messages where created_at < now() - interval '2 hours';
  end if;
  insert into interactions(bot_id, group_id, channel_id, user_id, kind, name, options) values (bot, gid, channel, auth.uid(), 'command', lower(cmd), clean) returning id into iid;
  return iid;
end $$;

create or replace function group_message_commands(gid uuid)
returns table (bot_id uuid, bot_username text, bot_name text, name text, description text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(gid) then return; end if;
  return query select c.bot_id, p.username, p.display_name, c.name, c.description
    from bot_commands c join group_members m on m.user_id = c.bot_id and m.group_id = gid join profiles p on p.id = c.bot_id
    where c.target = 'message' and (c.perm is null or has_perm(gid, c.perm))
    order by c.name, p.username;
end $$;

create or replace function invoke_message_command(msg uuid, bot uuid, cmd text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m record; gid uuid; req text; tg text; iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('slash', 30, interval '1 minute');
  select id, channel_id, author_id, content into m from messages where id = msg;
  if m.id is null or m.channel_id is null then raise exception 'That message is not in a group channel'; end if;
  select group_id into gid from channels where id = m.channel_id;
  if not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = bot) then raise exception 'That bot is not in this group'; end if;
  select perm, target into req, tg from bot_commands where bot_id = bot and name = lower(cmd);
  if tg is distinct from 'message' then raise exception 'That command does not exist any more'; end if;
  if req is not null and not has_perm(gid, req) then raise exception 'You need the "%" permission in this group to use that command', req; end if;
  insert into interactions(bot_id, group_id, channel_id, user_id, kind, name, options)
    values (bot, gid, m.channel_id, auth.uid(), 'command', lower(cmd),
            jsonb_build_object('message', m.id, 'author', m.author_id, 'content', left(coalesce(m.content, ''), 2000))) returning id into iid;
  return iid;
end $$;

grant execute on function bot_register_commands(text, jsonb) to anon, authenticated;
grant execute on function group_slash_commands(uuid), group_message_commands(uuid), invoke_command(uuid, uuid, text, jsonb), invoke_message_command(uuid, uuid, text) to authenticated;
