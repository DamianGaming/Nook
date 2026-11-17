-- Nook v30: more Activities: Wordle, Hangman, Rock Paper Scissors and Memory Match. Safe to run more than once. Run after update_v29.sql.

alter table activity_sessions drop constraint if exists activity_sessions_kind_check;
alter table activity_sessions add constraint activity_sessions_kind_check check (kind in ('tictactoe', 'connect4', 'watch', 'sketch', 'wordle', 'hangman', 'rps', 'memory'));

-- Secrets (the Wordle word, the Memory layout, hidden Rock Paper Scissors picks) live here. Nobody can read this table directly.
create table if not exists activity_secrets (session_id uuid primary key references activity_sessions(id) on delete cascade, secret jsonb not null default '{}');
alter table activity_secrets enable row level security;
revoke all on activity_secrets from public, anon, authenticated;
drop policy if exists "nobody reads secrets" on activity_secrets;
create policy "nobody reads secrets" on activity_secrets for all to anon, authenticated using (false) with check (false);

create or replace function wordle_words() returns text[] language sql immutable as $$ select array['about','above','abuse','actor','adult','after','again','agent','agree','ahead','alarm','album','alert','alike','alive','allow','alone','along','alter','among','angel','anger','angle','angry','apart','apple','apply','arena','argue','arise','armor','array','aside','asset','avoid','awake','award','aware','badly','baker','basic','beach','beard','beast','began','begin','being','below','bench','berry','birth','black','blade','blame','blank','blast','blaze','blend','bless','blind','block','blood','bloom','blown','board','boast','bonus','boost','booth','bound','brain','brand','brave','bread','break','brick','bride','brief','bring','broad','brown','brush','build','bunch','burst','cabin','cable','candy','carry','catch','cause','chain','chair','chalk','charm','chart','chase','cheap','check','cheek','cheer','chess','chest','chief','child','chill','chose','civil','claim','class','clean','clear','clerk','click','cliff','climb','clock','close','cloth','cloud','coach','coast','color','couch','could','count','court','cover','crack','craft','crane','crash','crazy','cream','crisp','cross','crowd','crown','crush','curve','daily','dance','dealt','death','debut','delay','depth','dirty','doubt','dozen','draft','drain','drama','drank','dream','dress','dried','drift','drill','drink','drive','drown','eager','early','earth','eight','elbow','elite','empty','enemy','enjoy','enter','equal','error','event','every','exact','exist','extra','fable','faith','false','fancy','fault','feast','fence','fever','fiber','field','fifth','fifty','fight','final','first','flame','flash','fleet','flesh','float','flock','flood','floor','flour','fluid','focus','force','forge','forth','forty','forum','found','frame','frank','fresh','front','frost','fruit','fully','funny','giant','given','glass','globe','glory','glove','grace','grade','grain','grand','grant','grape','graph','grasp','grass','great','green','greet','grief','grind','gross','group','grown','guard','guess','guest','guide','habit','happy','harsh','heart','heavy','hello','hence','honey','honor','horse','hotel','house','human','humor','hurry','ideal','image','index','inner','input','issue','ivory','jelly','jewel','joint','joker','judge','juice','knife','knock','known','label','labor','large','laser','later','laugh','layer','learn','lease','least','leave','legal','lemon','level','light','limit','linen','lives','lobby','local','logic','loose','lover','lower','loyal','lucky','lunch','magic','major','maker','march','match','maybe','mayor','meant','medal','media','melon','mercy','merge','merit','metal','meter','might','minor','minus','mixed','model','money','month','moral','motor','mount','mouse','mouth','movie','music','naive','nerve','never','newly','night','noble','noise','north','novel','nurse','ocean','offer','often','olive','onion','opera','orbit','order','other','ought','outer','owner','paint','panel','paper','party','pasta','patch','pause','peace','pearl','phase','phone','photo','piano','piece','pilot','pitch','pixel','pizza','place','plain','plane','plant','plate','plaza','point','polar','pound','power','press','price','pride','prime','print','prior','prize','proof','proud','prove','pupil','queen','quest','quick','quiet','quite','quote','radar','radio','raise','rally','ranch','range','rapid','ratio','reach','react','ready','realm','rebel','refer','relax','reply','rider','ridge','right','rigid','risky','rival','river','roast','robot','rocky','rough','round','route','royal','rural','salad','sauce','scale','scare','scene','scope','score','scout','sense','serve','seven','shade','shake','shall','shape','share','sharp','sheep','sheet','shelf','shell','shift','shine','shirt','shock','shoot','shore','short','shout','sight','sigma','silly','since','sixth','sixty','skill','skirt','sleep','slice','slide','slope','small','smart','smile','smoke','snake','solar','solid','solve','sorry','sound','south','space','spare','spark','speak','speed','spell','spend','spice','spike','spine','split','spoke','sport','squad','stack','staff','stage','stair','stake','stamp','stand','stare','start','state','steak','steam','steel','steep','steer','stern','stick','stiff','still','stock','stone','stood','store','storm','story','stove','strip','stuck','study','stuff','style','sugar','suite','sunny','super','sweet','swept','swift','swing','sword','table','taste','teach','thank','theme','there','thick','thing','think','third','those','three','threw','throw','thumb','tiger','tight','timer','tired','title','toast','today','token','tooth','topic','total','touch','tough','tower','trace','track','trade','trail','train','trait','trash','treat','trend','trial','tribe','trick','troop','truck','truly','trust','truth','twice','twist','uncle','under','union','unity','until','upper','upset','urban','usage','usual','valid','value','video','virus','visit','vital','vivid','vocal','voice','waste','watch','water','weary','weigh','weird','whale','wheat','wheel','where','which','while','white','whole','whose','width','woman','world','worry','worse','worst','worth','would','wound','woven','wrist','write','wrong','yacht','young','youth','zebra'] $$;
create or replace function hangman_words() returns text[] language sql immutable as $$ select array['airplane','backpack','balloon','bananas','bicycle','blanket','bridge','butterfly','cactus','camera','campfire','candle','captain','carrot','castle','chicken','chimney','cinema','circus','compass','cookie','cricket','crystal','diamond','dolphin','dragon','eagle','elephant','engine','farmer','feather','fireworks','flower','forest','fountain','galaxy','garden','giraffe','glacier','guitar','hammer','harbor','helmet','island','jacket','jungle','kangaroo','kitchen','ladder','lantern','lemonade','library','lighthouse','magnet','mammoth','marble','meadow','mirror','monkey','mountain','mushroom','notebook','octopus','orange','oxygen','panda','parrot','penguin','pepper','pillow','pirate','planet','pumpkin','puzzle','rainbow','rocket','sandwich','scooter','shadow','skeleton','snowman','spider','squirrel','station','sunrise','teapot','thunder','tiger','tornado','treasure','trumpet','tunnel','turtle','umbrella','unicorn','vampire','volcano','wallet','whisper','window','winter','wizard','zombie'] $$;
revoke all on function wordle_words(), hangman_words() from public, anon, authenticated;

-- g = right place, y = in the word but elsewhere, b = not in the word
create or replace function wordle_eval(guess text, answer text) returns text language plpgsql immutable as $$
declare res text[] := array['b','b','b','b','b']; left_ text[] := string_to_array(answer, null); i int; j int;
begin
  for i in 1..5 loop
    if substr(guess, i, 1) = substr(answer, i, 1) then res[i] := 'g'; left_[i] := null; end if;
  end loop;
  for i in 1..5 loop
    if res[i] = 'b' then
      for j in 1..5 loop
        if left_[j] is not null and left_[j] = substr(guess, i, 1) then res[i] := 'y'; left_[j] := null; exit; end if;
      end loop;
    end if;
  end loop;
  return array_to_string(res, '');
end $$;
revoke all on function wordle_eval(text, text) from public, anon, authenticated;

create or replace function start_activity(channel uuid, kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; sid uuid; st jsonb; uid uuid := auth.uid(); label text; sec jsonb := '{}'; w text; deck text[];
  emojis text[] := array['🍎','🍌','🍇','🍓','🍒','🥝','🍑','🍍','🚀','🎈','🎲','🎸','⚽','🐱','🐶','🦊','🐼','🐸','🌵','🌈','⭐','🍕','🍩','🎧'];
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform hit('activity_start', 20, interval '1 hour');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if kind not in ('tictactoe', 'connect4', 'watch', 'sketch', 'wordle', 'hangman', 'rps', 'memory') then raise exception 'Unknown activity'; end if;
  update activity_sessions set ended_at = now() where channel_id = channel and ended_at is null and updated_at < now() - interval '3 hours';
  if exists (select 1 from activity_sessions where channel_id = channel and ended_at is null) then
    raise exception 'Something is already running in this channel. Join it, or end it first.';
  end if;
  st := case kind
    when 'tictactoe' then jsonb_build_object('board', jsonb_build_array('', '', '', '', '', '', '', '', ''), 'turn', 'x', 'x', uid, 'o', null, 'winner', null, 'line', null, 'scores', jsonb_build_object('x', 0, 'o', 0, 'draw', 0))
    when 'connect4' then jsonb_build_object('board', (select jsonb_agg(0) from generate_series(1, 42)), 'turn', 1, 'p1', uid, 'p2', null, 'winner', 0, 'line', null, 'scores', jsonb_build_object('p1', 0, 'p2', 0, 'draw', 0))
    when 'watch' then jsonb_build_object('v', null, 'playing', false, 'pos', 0, 'at', now())
    when 'sketch' then jsonb_build_object('strokes', '[]'::jsonb)
    when 'wordle' then jsonb_build_object('guesses', '[]'::jsonb, 'status', 'playing', 'answer', null, 'wins', 0, 'losses', 0)
    when 'hangman' then null
    when 'rps' then jsonb_build_object('a', uid, 'b', null, 'picked', '{}'::jsonb, 'round', 1, 'scores', jsonb_build_object('a', 0, 'b', 0), 'last', null, 'winner', null, 'target', 3)
    else null end;
  if kind = 'wordle' then
    w := (wordle_words())[1 + floor(random() * array_length(wordle_words(), 1))::int];
    sec := jsonb_build_object('word', w);
  elsif kind = 'hangman' then
    w := (hangman_words())[1 + floor(random() * array_length(hangman_words(), 1))::int];
    sec := jsonb_build_object('word', w);
    st := jsonb_build_object('mask', (select jsonb_agg(''::text) from generate_series(1, length(w))), 'guessed', '[]'::jsonb, 'wrong', 0, 'status', 'playing', 'answer', null, 'wins', 0, 'losses', 0);
  elsif kind = 'rps' then
    sec := jsonb_build_object('picks', '{}'::jsonb);
  elsif kind = 'memory' then
    select array_agg(e) into deck from (select e from unnest(emojis) e order by random() limit 8) q;
    select array_agg(e order by random()) into deck from unnest(deck || deck) e;
    sec := jsonb_build_object('deck', to_jsonb(deck));
    st := jsonb_build_object('cards', (select jsonb_agg(''::text) from generate_series(1, 16)), 'matched', (select jsonb_agg(false) from generate_series(1, 16)), 'flipped', '[]'::jsonb, 'players', jsonb_build_array(uid), 'turn', 0, 'scores', jsonb_build_object(uid::text, 0), 'over', false, 'winners', '[]'::jsonb);
  end if;
  insert into activity_sessions(group_id, channel_id, kind, host, state) values (gid, channel, kind, uid, st) returning id into sid;
  if sec <> '{}' then insert into activity_secrets(session_id, secret) values (sid, sec); end if;
  label := case kind when 'tictactoe' then 'Tic-Tac-Toe' when 'connect4' then 'Connect Four' when 'watch' then 'Watch Together' when 'sketch' then 'Sketch Pad' when 'wordle' then 'Wordle' when 'hangman' then 'Hangman' when 'rps' then 'Rock Paper Scissors' else 'Memory Match' end;
  insert into messages(channel_id, author_id, content) values (channel, uid, '🎮 started **' || label || '**. Open **Activities** at the top of the channel to join in.');
  return sid;
end $$;
grant execute on function start_activity(uuid, text) to authenticated;

-- The first four activities keep their original rules function; this one adds the new ones in front of it.
do $$ begin
  if exists (select 1 from pg_proc where proname = 'activity_act' and pronamespace = 'public'::regnamespace)
     and not exists (select 1 from pg_proc where proname = 'activity_act_basic' and pronamespace = 'public'::regnamespace) then
    alter function activity_act(uuid, text, jsonb) rename to activity_act_basic;
  end if;
end $$;
revoke all on function activity_act_basic(uuid, text, jsonb) from public, anon, authenticated;

create or replace function activity_act(sid uuid, act text, arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare a activity_sessions; uid uuid := auth.uid(); st jsonb; sec jsonb; k text; w text; g text; r text; n int; i int; j int; letter text; seat text; picks jsonb; pa text; pb text; res text; cards jsonb; pl jsonb; deck jsonb; fl jsonb; hit_ boolean; best int; winners jsonb; mask jsonb; wrong int;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select kind into k from activity_sessions where id = sid;
  if k is null then raise exception 'That activity has ended'; end if;
  if k in ('tictactoe', 'connect4', 'watch', 'sketch') then return activity_act_basic(sid, act, arg); end if;
  perform hit('activity_act', 300, interval '1 minute');
  select * into a from activity_sessions where id = sid for update;
  if a.id is null or a.ended_at is not null then raise exception 'That activity has ended'; end if;
  if not is_group_member(a.group_id) then raise exception 'You are not in that group'; end if;
  st := a.state;
  select secret into sec from activity_secrets where session_id = sid;
  sec := coalesce(sec, '{}');

  if k = 'wordle' then
    if act = 'guess' then
      if st->>'status' <> 'playing' then raise exception 'This round is over. Start a new word.'; end if;
      g := lower(coalesce(arg->>'w', ''));
      if g !~ '^[a-z]{5}$' then raise exception 'Guesses are five letters'; end if;
      if exists (select 1 from jsonb_array_elements(st->'guesses') e where e->>'w' = g) then raise exception 'You already tried that word'; end if;
      w := sec->>'word';
      r := wordle_eval(g, w);
      st := jsonb_set(st, '{guesses}', (st->'guesses') || jsonb_build_array(jsonb_build_object('w', g, 'r', r, 'u', uid)));
      if g = w then
        st := jsonb_set(jsonb_set(jsonb_set(st, '{status}', '"won"'), '{answer}', to_jsonb(w)), '{wins}', to_jsonb((st->>'wins')::int + 1));
      elsif jsonb_array_length(st->'guesses') >= 6 then
        st := jsonb_set(jsonb_set(jsonb_set(st, '{status}', '"lost"'), '{answer}', to_jsonb(w)), '{losses}', to_jsonb((st->>'losses')::int + 1));
      end if;
    elsif act = 'new' then
      if st->>'status' = 'playing' then raise exception 'Finish this word first'; end if;
      sec := jsonb_build_object('word', (wordle_words())[1 + floor(random() * array_length(wordle_words(), 1))::int]);
      st := jsonb_set(jsonb_set(jsonb_set(st, '{guesses}', '[]'), '{status}', '"playing"'), '{answer}', 'null');
    else raise exception 'Unknown action'; end if;

  elsif k = 'hangman' then
    if act = 'guess' then
      if st->>'status' <> 'playing' then raise exception 'This round is over. Start a new word.'; end if;
      letter := lower(coalesce(arg->>'l', ''));
      if letter !~ '^[a-z]$' then raise exception 'Pick a letter'; end if;
      if st->'guessed' ? letter then raise exception 'That letter was already tried'; end if;
      w := sec->>'word';
      st := jsonb_set(st, '{guessed}', (st->'guessed') || to_jsonb(letter));
      if position(letter in w) > 0 then
        mask := st->'mask';
        for i in 1..length(w) loop if substr(w, i, 1) = letter then mask := jsonb_set(mask, array[(i - 1)::text], to_jsonb(letter)); end if; end loop;
        st := jsonb_set(st, '{mask}', mask);
        if not exists (select 1 from jsonb_array_elements_text(mask) m where m = '') then
          st := jsonb_set(jsonb_set(jsonb_set(st, '{status}', '"won"'), '{answer}', to_jsonb(w)), '{wins}', to_jsonb((st->>'wins')::int + 1));
        end if;
      else
        wrong := (st->>'wrong')::int + 1;
        st := jsonb_set(st, '{wrong}', to_jsonb(wrong));
        if wrong >= 7 then
          st := jsonb_set(jsonb_set(jsonb_set(st, '{status}', '"lost"'), '{answer}', to_jsonb(w)), '{losses}', to_jsonb((st->>'losses')::int + 1));
        end if;
      end if;
    elsif act = 'new' then
      if st->>'status' = 'playing' then raise exception 'Finish this word first'; end if;
      w := (hangman_words())[1 + floor(random() * array_length(hangman_words(), 1))::int];
      sec := jsonb_build_object('word', w);
      st := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(st, '{mask}', (select jsonb_agg(''::text) from generate_series(1, length(w)))), '{guessed}', '[]'), '{wrong}', '0'), '{status}', '"playing"'), '{answer}', 'null');
    else raise exception 'Unknown action'; end if;

  elsif k = 'rps' then
    seat := case when st->>'a' = uid::text then 'a' when st->>'b' = uid::text then 'b' else null end;
    if act = 'join' then
      if seat is not null then null;
      elsif st->>'a' is null then st := jsonb_set(st, '{a}', to_jsonb(uid));
      elsif st->>'b' is null then st := jsonb_set(st, '{b}', to_jsonb(uid));
      else raise exception 'Both seats are taken. You can watch.'; end if;
    elsif act = 'leave' then
      if seat is not null then st := jsonb_set(st, array[seat], 'null'); end if;
    elsif act = 'pick' then
      if seat is null then raise exception 'Take a seat first'; end if;
      if st->>'a' is null or st->>'b' is null then raise exception 'Waiting for a second player'; end if;
      if st->>'winner' is not null then raise exception 'The match is over. Start a rematch.'; end if;
      letter := coalesce(arg->>'c', '');
      if letter not in ('r', 'p', 's') then raise exception 'Pick rock, paper or scissors'; end if;
      picks := coalesce(sec->'picks', '{}');
      if picks ? seat then raise exception 'You already picked. Waiting for your opponent.'; end if;
      picks := jsonb_set(picks, array[seat], to_jsonb(letter));
      st := jsonb_set(st, array['picked', seat], 'true');
      if picks ? 'a' and picks ? 'b' then
        pa := picks->>'a'; pb := picks->>'b';
        res := case when pa = pb then 'draw' when (pa = 'r' and pb = 's') or (pa = 'p' and pb = 'r') or (pa = 's' and pb = 'p') then 'a' else 'b' end;
        st := jsonb_set(st, '{last}', jsonb_build_object('a', pa, 'b', pb, 'res', res, 'round', (st->>'round')::int));
        st := jsonb_set(st, '{round}', to_jsonb((st->>'round')::int + 1));
        st := jsonb_set(st, '{picked}', '{}');
        picks := '{}';
        if res <> 'draw' then
          n := (st->'scores'->>res)::int + 1;
          st := jsonb_set(st, array['scores', res], to_jsonb(n));
          if n >= (st->>'target')::int then st := jsonb_set(st, '{winner}', to_jsonb(res)); end if;
        end if;
      end if;
      sec := jsonb_set(sec, '{picks}', picks);
    elsif act = 'reset' then
      if seat is null and a.host <> uid then raise exception 'Only the players can start a rematch'; end if;
      st := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(st, '{scores}', '{"a":0,"b":0}'), '{winner}', 'null'), '{last}', 'null'), '{round}', '1'), '{picked}', '{}');
      sec := jsonb_build_object('picks', '{}'::jsonb);
    else raise exception 'Unknown action'; end if;

  elsif k = 'memory' then
    pl := st->'players';
    if act = 'join' then
      if pl ? uid::text then null;
      elsif jsonb_array_length(pl) >= 4 then raise exception 'The table is full (4 players). You can watch.';
      else
        st := jsonb_set(jsonb_set(st, '{players}', pl || to_jsonb(uid)), array['scores', uid::text], '0');
      end if;
    elsif act = 'flip' then
      if not (pl ? uid::text) then raise exception 'Take a seat first'; end if;
      if (st->>'over')::boolean then raise exception 'The game is over. Start a rematch.'; end if;
      if pl->>((st->>'turn')::int) <> uid::text then raise exception 'It is not your turn'; end if;
      i := (arg->>'i')::int;
      if i is null or i < 0 or i > 15 then raise exception 'Pick a card'; end if;
      cards := st->'cards'; fl := st->'flipped'; deck := sec->'deck';
      if jsonb_array_length(fl) = 2 then
        for j in 0..1 loop cards := jsonb_set(cards, array[(fl->>j)], '""'); end loop;
        fl := '[]';
      end if;
      if (st->'matched'->>i)::boolean or fl @> to_jsonb(i) then raise exception 'That card is already face up'; end if;
      cards := jsonb_set(cards, array[i::text], deck->i);
      fl := fl || to_jsonb(i);
      st := jsonb_set(jsonb_set(st, '{cards}', cards), '{flipped}', fl);
      if jsonb_array_length(fl) = 2 then
        if deck->(fl->>0)::int = deck->(fl->>1)::int then
          st := jsonb_set(st, array['matched', fl->>0], 'true');
          st := jsonb_set(st, array['matched', fl->>1], 'true');
          st := jsonb_set(st, array['scores', uid::text], to_jsonb((st->'scores'->>(uid::text))::int + 1));
          st := jsonb_set(st, '{flipped}', '[]');
          if not exists (select 1 from jsonb_array_elements_text(st->'matched') m where m = 'false') then
            best := (select max(v::int) from jsonb_each_text(st->'scores') s(k_, v));
            winners := (select jsonb_agg(k_) from jsonb_each_text(st->'scores') s(k_, v) where v::int = best);
            st := jsonb_set(jsonb_set(st, '{over}', 'true'), '{winners}', winners);
          end if;
        else
          st := jsonb_set(st, '{turn}', to_jsonb(((st->>'turn')::int + 1) % jsonb_array_length(pl)));
        end if;
      end if;
    elsif act = 'reset' then
      if not (pl ? uid::text) and a.host <> uid then raise exception 'Only the players can start a rematch'; end if;
      deck := to_jsonb((select array_agg(e order by random()) from unnest(array(select jsonb_array_elements_text(sec->'deck') ) ) e));
      sec := jsonb_build_object('deck', deck);
      st := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(st, '{cards}', (select jsonb_agg(''::text) from generate_series(1, 16))), '{matched}', (select jsonb_agg(false) from generate_series(1, 16))), '{flipped}', '[]'), '{over}', 'false'), '{winners}', '[]'), '{turn}', '0');
      st := jsonb_set(st, '{scores}', (select jsonb_object_agg(p, 0) from jsonb_array_elements_text(pl) p));
    else raise exception 'Unknown action'; end if;
  else
    raise exception 'Unknown activity';
  end if;

  update activity_sessions set state = st, version = version + 1, updated_at = now() where id = sid;
  insert into activity_secrets(session_id, secret) values (sid, sec) on conflict (session_id) do update set secret = excluded.secret;
  return jsonb_build_object('version', a.version + 1, 'now', now());
end $$;
grant execute on function activity_act(uuid, text, jsonb) to authenticated;
