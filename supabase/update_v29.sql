-- Nook v29: bots can have up to 200 slash commands, bots show as online while they run, and Activities
-- (Tic-Tac-Toe, Connect Four, Watch Together and a shared Sketch Pad inside a channel). Safe to run more than once.

-- ───────────── More slash commands (200 per bot) ─────────────
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


-- ───────────── Bots show as online while they run ─────────────
alter table bots add column if not exists last_seen timestamptz;

-- Every bot API call counts as a sign of life (written at most every 20 seconds).
create or replace function bot_hit(bid uuid, k text, max_n int, win interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.02 then delete from rate_events where at < now() - interval '1 day'; end if;
  if (select count(*) from rate_events where user_id = bid and key = k and at > now() - win) >= max_n then
    raise exception 'Rate limit reached for %. Slow down and try again shortly.', k;
  end if;
  insert into rate_events(user_id, key) values (bid, k);
  update bots set last_seen = now() where id = bid and (last_seen is null or last_seen < now() - interval '20 seconds');
end $$;
revoke all on function bot_hit(uuid, text, int, interval) from public, anon, authenticated;

-- The bots (that share a group with you) that are running right now.
create or replace function online_bots() returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from bots b
  where b.last_seen > now() - interval '75 seconds'
    and auth.uid() is not null
    and exists (select 1 from group_members m where m.user_id = b.id and is_group_member(m.group_id))
$$;
grant execute on function online_bots() to authenticated;

-- ───────────── Activities ─────────────
create table if not exists activity_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  kind text not null check (kind in ('tictactoe', 'connect4', 'watch', 'sketch')),
  host uuid not null references profiles(id) on delete cascade,
  state jsonb not null,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists activity_active_idx on activity_sessions (channel_id) where ended_at is null;
alter table activity_sessions enable row level security;
drop policy if exists "members see activities" on activity_sessions;
create policy "members see activities" on activity_sessions for select to authenticated using (is_group_member(group_id));
grant select on activity_sessions to authenticated;
do $$ begin alter publication supabase_realtime add table activity_sessions; exception when others then null; end $$;

create or replace function activity_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function activity_now() to authenticated;

create or replace function ttt_result(b jsonb) returns jsonb language plpgsql immutable as $$
declare lines int[][] := array[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; i int; a text; isfull boolean := true; k int;
begin
  for i in 1..8 loop
    a := b->>(lines[i][1]);
    if a <> '' and a = b->>(lines[i][2]) and a = b->>(lines[i][3]) then return jsonb_build_object('winner', a, 'line', to_jsonb(lines[i])); end if;
  end loop;
  for k in 0..8 loop if b->>k = '' then isfull := false; end if; end loop;
  if isfull then return jsonb_build_object('winner', 'draw', 'line', null); end if;
  return jsonb_build_object('winner', null, 'line', null);
end $$;

create or replace function c4_result(b int[]) returns jsonb language plpgsql immutable as $$
declare r int; c int; d int; dr int[] := array[0,1,1,1]; dc int[] := array[1,0,1,-1]; k int; p int; cells int[]; ok boolean; rr int; cc int;
begin
  for r in 0..5 loop for c in 0..6 loop
    p := b[r*7+c+1];
    if p <> 0 then
      for d in 1..4 loop
        ok := true; cells := array[r*7+c];
        for k in 1..3 loop
          rr := r + dr[d]*k; cc := c + dc[d]*k;
          if rr < 0 or rr > 5 or cc < 0 or cc > 6 or b[rr*7+cc+1] <> p then ok := false; exit; end if;
          cells := cells || (rr*7+cc);
        end loop;
        if ok then return jsonb_build_object('winner', p, 'line', to_jsonb(cells)); end if;
      end loop;
    end if;
  end loop; end loop;
  if not (0 = any(b)) then return jsonb_build_object('winner', 3, 'line', null); end if;
  return jsonb_build_object('winner', 0, 'line', null);
end $$;

create or replace function start_activity(channel uuid, kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; sid uuid; st jsonb; uid uuid := auth.uid(); label text;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform hit('activity_start', 20, interval '1 hour');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if kind not in ('tictactoe', 'connect4', 'watch', 'sketch') then raise exception 'Unknown activity'; end if;
  update activity_sessions set ended_at = now() where channel_id = channel and ended_at is null and updated_at < now() - interval '3 hours';
  if exists (select 1 from activity_sessions where channel_id = channel and ended_at is null) then
    raise exception 'Something is already running in this channel. Join it, or end it first.';
  end if;
  st := case kind
    when 'tictactoe' then jsonb_build_object('board', jsonb_build_array('', '', '', '', '', '', '', '', ''), 'turn', 'x', 'x', uid, 'o', null, 'winner', null, 'line', null, 'scores', jsonb_build_object('x', 0, 'o', 0, 'draw', 0))
    when 'connect4' then jsonb_build_object('board', (select jsonb_agg(0) from generate_series(1, 42)), 'turn', 1, 'p1', uid, 'p2', null, 'winner', 0, 'line', null, 'scores', jsonb_build_object('p1', 0, 'p2', 0, 'draw', 0))
    when 'watch' then jsonb_build_object('v', null, 'playing', false, 'pos', 0, 'at', now())
    else jsonb_build_object('strokes', '[]'::jsonb) end;
  insert into activity_sessions(group_id, channel_id, kind, host, state) values (gid, channel, kind, uid, st) returning id into sid;
  label := case kind when 'tictactoe' then 'Tic-Tac-Toe' when 'connect4' then 'Connect Four' when 'watch' then 'Watch Together' else 'Sketch Pad' end;
  insert into messages(channel_id, author_id, content) values (channel, uid, '🎮 started **' || label || '**. Open **Activities** at the top of the channel to join in.');
  return sid;
end $$;

create or replace function end_activity(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a activity_sessions; uid uuid := auth.uid();
begin
  select * into a from activity_sessions where id = sid;
  if a.id is null or a.ended_at is not null then return; end if;
  if not is_group_member(a.group_id) then raise exception 'Not allowed'; end if;
  if a.host <> uid and not is_group_founder(a.group_id) and not exists (select 1 from group_members m where m.group_id = a.group_id and m.user_id = uid and 'messages' = any(m.perms)) then
    raise exception 'Only the person who started it, or a moderator, can end it';
  end if;
  update activity_sessions set ended_at = now(), version = version + 1, updated_at = now() where id = sid;
end $$;

-- Every move in every activity goes through here, so the rules are enforced on the server.
create or replace function activity_act(sid uuid, act text, arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare a activity_sessions; uid uuid := auth.uid(); st jsonb; i int; col int; r int; b int[]; res jsonb; w text; seat text; url text; vid text; pos numeric; strokes jsonb; s jsonb; pts jsonb; n int;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform hit('activity_act', 300, interval '1 minute');
  select * into a from activity_sessions where id = sid for update;
  if a.id is null or a.ended_at is not null then raise exception 'That activity has ended'; end if;
  if not is_group_member(a.group_id) then raise exception 'You are not in that group'; end if;
  st := a.state;

  if a.kind = 'tictactoe' then
    if act = 'join' then
      if st->>'x' = uid::text or st->>'o' = uid::text then null;
      elsif st->>'x' is null then st := jsonb_set(st, '{x}', to_jsonb(uid));
      elsif st->>'o' is null then st := jsonb_set(st, '{o}', to_jsonb(uid));
      else raise exception 'Both seats are taken. You can watch.'; end if;
    elsif act = 'leave' then
      if st->>'x' = uid::text then st := jsonb_set(st, '{x}', 'null'); elsif st->>'o' = uid::text then st := jsonb_set(st, '{o}', 'null'); end if;
    elsif act = 'move' then
      i := (arg->>'i')::int;
      if i is null or i < 0 or i > 8 then raise exception 'Pick a square'; end if;
      if st->>'x' is null or st->>'o' is null then raise exception 'Waiting for a second player'; end if;
      if st->>'winner' is not null then raise exception 'The game is over. Start a rematch.'; end if;
      seat := st->>'turn';
      if st->>seat <> uid::text then raise exception 'It is not your turn'; end if;
      if st->'board'->>i <> '' then raise exception 'That square is taken'; end if;
      st := jsonb_set(st, array['board', i::text], to_jsonb(seat));
      res := ttt_result(st->'board');
      if res->>'winner' is null then
        st := jsonb_set(st, '{turn}', to_jsonb(case seat when 'x' then 'o' else 'x' end));
      else
        st := jsonb_set(jsonb_set(st, '{winner}', res->'winner'), '{line}', coalesce(res->'line', 'null'::jsonb));
        w := res->>'winner';
        st := jsonb_set(st, array['scores', w], to_jsonb(coalesce((st->'scores'->>w)::int, 0) + 1));
      end if;
    elsif act = 'reset' then
      if st->>'x' <> uid::text and st->>'o' <> uid::text and a.host <> uid then raise exception 'Only the players can start a rematch'; end if;
      st := jsonb_set(jsonb_set(jsonb_set(jsonb_set(st, '{board}', jsonb_build_array('', '', '', '', '', '', '', '', '')), '{winner}', 'null'), '{line}', 'null'), '{turn}', to_jsonb(case when random() < 0.5 then 'x' else 'o' end));
    else raise exception 'Unknown action'; end if;

  elsif a.kind = 'connect4' then
    if act = 'join' then
      if st->>'p1' = uid::text or st->>'p2' = uid::text then null;
      elsif st->>'p1' is null then st := jsonb_set(st, '{p1}', to_jsonb(uid));
      elsif st->>'p2' is null then st := jsonb_set(st, '{p2}', to_jsonb(uid));
      else raise exception 'Both seats are taken. You can watch.'; end if;
    elsif act = 'leave' then
      if st->>'p1' = uid::text then st := jsonb_set(st, '{p1}', 'null'); elsif st->>'p2' = uid::text then st := jsonb_set(st, '{p2}', 'null'); end if;
    elsif act = 'move' then
      col := (arg->>'col')::int;
      if col is null or col < 0 or col > 6 then raise exception 'Pick a column'; end if;
      if st->>'p1' is null or st->>'p2' is null then raise exception 'Waiting for a second player'; end if;
      if (st->>'winner')::int <> 0 then raise exception 'The game is over. Start a rematch.'; end if;
      n := (st->>'turn')::int;
      if st->>(case n when 1 then 'p1' else 'p2' end) <> uid::text then raise exception 'It is not your turn'; end if;
      b := array(select jsonb_array_elements_text(st->'board')::int);
      r := -1;
      for i in reverse 5..0 loop if b[i*7+col+1] = 0 then r := i; exit; end if; end loop;
      if r < 0 then raise exception 'That column is full'; end if;
      b[r*7+col+1] := n;
      st := jsonb_set(st, '{board}', to_jsonb(b));
      res := c4_result(b);
      if (res->>'winner')::int = 0 then
        st := jsonb_set(st, '{turn}', to_jsonb(3 - n));
      else
        st := jsonb_set(jsonb_set(st, '{winner}', res->'winner'), '{line}', coalesce(res->'line', 'null'::jsonb));
        w := case (res->>'winner')::int when 1 then 'p1' when 2 then 'p2' else 'draw' end;
        st := jsonb_set(st, array['scores', w], to_jsonb(coalesce((st->'scores'->>w)::int, 0) + 1));
      end if;
    elsif act = 'reset' then
      if st->>'p1' <> uid::text and st->>'p2' <> uid::text and a.host <> uid then raise exception 'Only the players can start a rematch'; end if;
      st := jsonb_set(jsonb_set(jsonb_set(jsonb_set(st, '{board}', (select jsonb_agg(0) from generate_series(1, 42))), '{winner}', '0'), '{line}', 'null'), '{turn}', to_jsonb(1 + (random() < 0.5)::int));
    else raise exception 'Unknown action'; end if;

  elsif a.kind = 'watch' then
    pos := greatest(0, least(coalesce((arg->>'pos')::numeric, 0), 86400));
    if act = 'load' then
      url := coalesce(arg->>'url', '');
      vid := substring(url from '(?:youtu\.be/|youtube\.com/(?:watch\?(?:[^ ]*&)?v=|embed/|shorts/|live/))([A-Za-z0-9_-]{11})');
      if vid is null and url ~ '^[A-Za-z0-9_-]{11}$' then vid := url; end if;
      if vid is null then raise exception 'Paste a YouTube link'; end if;
      st := jsonb_build_object('v', vid, 'playing', false, 'pos', 0, 'at', now(), 'by', uid);
    elsif act in ('play', 'pause', 'seek') then
      if st->>'v' is null then raise exception 'Pick a video first'; end if;
      st := jsonb_set(jsonb_set(jsonb_set(st, '{playing}', to_jsonb(case act when 'play' then true when 'pause' then false else (st->>'playing')::boolean end)), '{pos}', to_jsonb(pos)), '{at}', to_jsonb(now()));
    else raise exception 'Unknown action'; end if;

  else -- sketch
    strokes := st->'strokes';
    if act = 'stroke' then
      if coalesce(arg->>'c', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Bad colour'; end if;
      n := coalesce((arg->>'w')::int, 4);
      pts := arg->'p';
      if n < 1 or n > 40 or jsonb_typeof(pts) <> 'array' or jsonb_array_length(pts) < 2 or jsonb_array_length(pts) > 800 or jsonb_array_length(pts) % 2 <> 0 then raise exception 'Bad stroke'; end if;
      if exists (select 1 from jsonb_array_elements(pts) e where jsonb_typeof(e) <> 'number' or (e#>>'{}')::numeric not between 0 and 1000) then raise exception 'Bad stroke'; end if;
      s := jsonb_build_object('c', lower(arg->>'c'), 'w', n, 'p', pts, 'u', uid);
      strokes := strokes || jsonb_build_array(s);
      while jsonb_array_length(strokes) > 400 or length(strokes::text) > 240000 loop strokes := strokes - 0; end loop;
      st := jsonb_build_object('strokes', strokes);
    elsif act = 'clear' then
      st := jsonb_build_object('strokes', '[]'::jsonb);
    elsif act = 'undo' then
      -- remove your own latest stroke
      for i in reverse (jsonb_array_length(strokes) - 1)..0 loop
        if strokes->i->>'u' = uid::text then strokes := strokes - i; exit; end if;
      end loop;
      st := jsonb_build_object('strokes', strokes);
    else raise exception 'Unknown action'; end if;
  end if;

  update activity_sessions set state = st, version = version + 1, updated_at = now() where id = sid;
  return jsonb_build_object('version', a.version + 1, 'now', now());
end $$;

grant execute on function start_activity(uuid, text), end_activity(uuid), activity_act(uuid, text, jsonb) to authenticated;
