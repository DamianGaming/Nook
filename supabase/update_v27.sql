-- Nook v27: slash commands for bots, buttons and dropdowns on bot messages, "only you can see this" replies.
-- Safe to run more than once. Run after update_v26.sql.

-- ───────────────────────── Slash commands ─────────────────────────
create table if not exists bot_commands (
  bot_id uuid not null references profiles(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_-]{1,32}$'),
  description text not null check (char_length(description) between 1 and 100),
  options jsonb not null default '[]',
  primary key (bot_id, name)
);
alter table bot_commands enable row level security; -- no policies: only the functions below touch it

-- Every click, command and menu choice made by a person waits here until the bot picks it up.
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('command', 'button', 'select')),
  name text not null,
  options jsonb not null default '{}',
  picked jsonb not null default '[]',
  message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists interactions_bot_idx on interactions (bot_id, created_at);
alter table interactions enable row level security;

-- Replies only one person can see.
create table if not exists ephemeral_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  bot_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists ephemeral_idx on ephemeral_messages (user_id, channel_id, created_at);
alter table ephemeral_messages enable row level security;
drop policy if exists "own hidden messages" on ephemeral_messages;
create policy "own hidden messages" on ephemeral_messages for select to authenticated using (user_id = auth.uid());
drop policy if exists "dismiss own hidden messages" on ephemeral_messages;
create policy "dismiss own hidden messages" on ephemeral_messages for delete to authenticated using (user_id = auth.uid());
grant select, delete on ephemeral_messages to authenticated;

-- bot_register_commands(token, [{name, description, options:[{name, description, type, required, choices:[{name,value}]}]}])
-- replaces the bot's whole list (like Discord's "bulk overwrite"). An empty list removes them all.
create or replace function bot_register_commands(token text, cmds jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); c jsonb; o jsonb; ch jsonb; n int := 0; seen text[] := '{}';
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'register', 10, interval '1 minute');
  if cmds is null or jsonb_typeof(cmds) <> 'array' then raise exception 'Commands must be a list'; end if;
  if jsonb_array_length(cmds) > 50 then raise exception 'A bot can have up to 50 slash commands'; end if;
  for c in select * from jsonb_array_elements(cmds) loop
    if coalesce(c->>'name', '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Command names use lowercase letters, numbers, - and _ (1 to 32 characters): %', c->>'name'; end if;
    if (c->>'name') = any(seen) then raise exception 'Two commands are called %', c->>'name'; end if;
    seen := seen || (c->>'name');
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
    insert into bot_commands(bot_id, name, description, options) values (bid, c->>'name', c->>'description',
      coalesce((select jsonb_agg(jsonb_build_object('name', x->>'name', 'description', x->>'description', 'type', coalesce(x->>'type', 'string'),
        'required', coalesce((x->>'required')::boolean, false), 'choices', coalesce(x->'choices', '[]'::jsonb))) from jsonb_array_elements(coalesce(c->'options', '[]')) x), '[]'::jsonb));
    n := n + 1;
  end loop;
  return n;
end $$;

-- What the "/" menu shows: the commands of every bot in a group.
create or replace function group_slash_commands(gid uuid)
returns table (bot_id uuid, bot_username text, bot_name text, bot_avatar text, name text, description text, options jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(gid) then return; end if;
  return query select c.bot_id, p.username, p.display_name, p.avatar_url, c.name, c.description, c.options
    from bot_commands c join group_members m on m.user_id = c.bot_id and m.group_id = gid join profiles p on p.id = c.bot_id
    order by c.name, p.username;
end $$;

-- A person runs a command. Options arrive as {"optionname": value}; they are checked against what the bot declared.
create or replace function invoke_command(channel uuid, bot uuid, cmd text, opts jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; def jsonb; o jsonb; v jsonb; clean jsonb := '{}'; iid uuid; t text; s text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('slash', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = bot) then raise exception 'That bot is not in this group'; end if;
  select options into def from bot_commands where bot_id = bot and name = lower(cmd);
  if def is null then raise exception 'That command does not exist any more'; end if;
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

-- A person presses a button or picks from a dropdown on a bot's message.
create or replace function press_component(message uuid, custom_id text, picked jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public as $$
declare m record; gid uuid; iid uuid; k text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('press', 60, interval '1 minute');
  if coalesce(custom_id, '') !~ '^[A-Za-z0-9_:.-]{1,64}$' then raise exception 'Not a valid button'; end if;
  select id, channel_id, author_id into m from messages where id = message;
  if m.id is null or m.channel_id is null then raise exception 'That message is gone'; end if;
  select group_id into gid from channels where id = m.channel_id;
  if not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if not exists (select 1 from profiles where id = m.author_id and is_bot) then raise exception 'Only bot messages have buttons'; end if;
  picked := coalesce(picked, '[]');
  if jsonb_typeof(picked) <> 'array' or jsonb_array_length(picked) > 25 or char_length(picked::text) > 2000 then raise exception 'Too many choices'; end if;
  k := case when jsonb_array_length(picked) > 0 then 'select' else 'button' end;
  insert into interactions(bot_id, group_id, channel_id, user_id, kind, name, picked, message_id) values (m.author_id, gid, m.channel_id, auth.uid(), k, custom_id, picked, message) returning id into iid;
  return iid;
end $$;

-- The bot asks for new interactions (same cursor idea as bot_events2).
create or replace function bot_interactions(token text, after timestamptz, lim int default 50)
returns table (id uuid, at timestamptz, kind text, name text, options jsonb, picked jsonb, group_id uuid, group_name text, channel_id uuid, channel_name text,
               message_id uuid, message_content text, user_id uuid, username text, display_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare bid uuid := bot_auth(token);
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'events', 240, interval '1 minute');
  if after is null then return; end if;
  return query select i.id, i.created_at, i.kind, i.name, i.options, i.picked, i.group_id, g.name, i.channel_id, c.name, i.message_id, m.content, i.user_id, p.username, p.display_name
    from interactions i join groups g on g.id = i.group_id join channels c on c.id = i.channel_id join profiles p on p.id = i.user_id left join messages m on m.id = i.message_id
    where i.bot_id = bid and i.created_at > after order by i.created_at limit least(greatest(coalesce(lim, 50), 1), 100);
end $$;

-- Answer an interaction (within 15 minutes, as many times as you like):
--   mode 'reply'  → a new message, or one only that person sees when hidden is true
--   mode 'update' → change the message the button was on
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
  insert into messages(channel_id, author_id, content) values (i.channel_id, bid, content) returning id into mid;
  return mid;
end $$;

grant execute on function group_slash_commands(uuid), invoke_command(uuid, uuid, text, jsonb), press_component(uuid, text, jsonb) to authenticated;
grant execute on function bot_register_commands(text, jsonb), bot_interactions(text, timestamptz, int), bot_respond(text, uuid, text, boolean, text) to anon, authenticated;
