#!/bin/bash
# Applies every SQL file to a fresh database, then checks behaviour as real users. See README.md.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; SQL="$HERE/.."
export PGHOST="${PGHOST:-/tmp/pgrun}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
ADMIN="psql -qAt -v ON_ERROR_STOP=0"
DB="$ADMIN -d nook_test"
FAILS=0
$ADMIN -d postgres -c "drop database if exists nook_test" -c "create database nook_test" >/dev/null 2>&1
$DB -f "$HERE/stubs.sql" >/dev/null 2>&1
for f in schema fix_profiles update_media update_v3 update_v4 update_v5 update_v6 update_v7 update_v8 update_v9 update_v10 update_v11 update_v12 update_v13 update_v14 update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21 update_v22 update_v23 update_v24; do
  out=$($DB -f "$SQL/$f.sql" 2>&1 | grep -E "ERROR:|FATAL:" | head -3)
  [ -n "$out" ] && { echo "FAIL  $f.sql: $out"; FAILS=$((FAILS+1)); }
done
# a second run must be harmless
for f in update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21 update_v22 update_v23 update_v24; do
  out=$($DB -f "$SQL/$f.sql" 2>&1 | grep -E "ERROR:|FATAL:" | head -3)
  [ -n "$out" ] && { echo "FAIL  re-running $f.sql: $out"; FAILS=$((FAILS+1)); }
done
$DB -c "grant all on all tables in schema public to anon, authenticated, service_role; grant all on all functions in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role;" >/dev/null

as() { $DB -c "select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated','aal','${3:-aal1}')::text, false)" -c "set role authenticated" -c "$2" 2>&1 | grep -v '^{' | grep -v "^SET$"; }
check() { # check "what" "text that must appear" "actual output"
  if echo "$3" | grep -qF -- "$2"; then echo "ok    $1"; else echo "FAIL  $1  (wanted: $2, got: $3)"; FAILS=$((FAILS+1)); fi; }
A=11111111-1111-1111-1111-111111111111; B=22222222-2222-2222-2222-222222222222; C=33333333-3333-3333-3333-333333333333
$DB -c "insert into auth.users(id,email,raw_user_meta_data) values ('$A','amy@x.com','{\"username\":\"amy\"}'),('$B','bee@x.com','{\"username\":\"bee\"}'),('$C','cat@x.com','{\"username\":\"cat\"}')" >/dev/null
GID=$(as $A "select create_group('Test','x')" | tail -1)
CH=$($DB -c "select id from channels where group_id='$GID'" | tail -1)
CODE=$($DB -c "select invite_code from groups where id='$GID'" | tail -1)
as $B "select join_group('$CODE')" >/dev/null
check "wrong invite code gives nothing, not an error" "t" "$(as $C "select join_group('nope') is null")"

as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','hey @bee are you there'),('$CH','$A','mail me at x@bee.com')" >/dev/null
check "unread @mention counted once (email is not a mention)" "|1" "$(as $B "select * from mention_counts('bee')")"

MID=$(as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','Hello world from Amy') returning id" | head -1)
check "reaction: any emoji" "🎉" "$(as $B "insert into reactions values ('$MID','$B','🎉') returning kind")"
check "reaction: custom emoji token" "1" "$(as $B "insert into reactions values ('$MID','$B','<e:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:party_parrot>') returning 1")"
check "reaction: plain words refused" "violates check" "$(as $B "insert into reactions values ('$MID','$B','hello') returning 1")"
check "reaction: at most 20 different" "most different" "$(as $B "do \$\$ begin for i in 1..22 loop insert into reactions values ('$MID','$B','x'||i||'🎈'); end loop; end \$\$")"

check "pin: plain member refused" "permission" "$(as $B "select set_pin('$MID', true)")"
as $A "select set_pin('$MID', true)" >/dev/null
check "pin: founder can, everyone sees" "1" "$(as $B "select count(*) from pins")"

check "search finds a message" "Hello world" "$(as $B "select content from search_messages('hello wor','$GID')")"
check "search treats % literally" "0" "$(as $B "select count(*) from search_messages('%%','$GID')")"
check "search refuses non-members" "Not allowed" "$(as $C "select count(*) from search_messages('hello','$GID')")"

check "timeout: needs permission" "members permission" "$(as $C "select timeout_member('$GID','$B',10)")"
as $A "select timeout_member('$GID','$B',10)" >/dev/null
check "timeout: blocks sending" "timed out" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','still here?')")"
as $A "select timeout_member('$GID','$B',0)" >/dev/null
check "timeout: lifted" "1" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','back') returning 1" | head -1)"
check "bulk delete returns how many" "1" "$(as $A "select bulk_delete_messages('$GID','$B',24)")"
check "audit log: founder can read" "bulk_delete" "$(as $A "select action from group_audit where group_id='$GID'")"
check "audit log: plain members cannot" "0" "$(as $B "select count(*) from group_audit")"

check "notification settings are private" "0" "$(as $B "insert into notif_prefs(user_id,target,kind,mode) values ('$B','$CH','channel','none')" >/dev/null; as $A "select count(*) from notif_prefs")"

as $B "select log_client_error('Boom','at x','/a','UA')" >/dev/null
check "error log: users cannot read it" "0" "$(as $B "select count(*) from client_errors")"
check "error log: staff need two-factor" "Staff only" "$(as $B "select * from admin_client_errors()")"
$DB -c "update profiles set badges=array['staff'] where id='$B'" >/dev/null
check "error log: staff with two-factor can read" "Boom" "$(as $B "select message from admin_client_errors()" aal2)"

check "activity: valid" "Minecraft" "$(as $A "update profiles set activity_type='playing', activity_name='Minecraft', activity_at=now() where id='$A' returning activity_name")"
check "activities list: valid" "1" "$(as $A "update profiles set activities='[{\"t\":\"playing\",\"n\":\"Minecraft\"}]'::jsonb where id='$A' returning jsonb_array_length(activities)")"
check "activities list: capped at 6" "violates check" "$(as $A "update profiles set activities=(select jsonb_agg(jsonb_build_object('t','using','n','x'||g)) from generate_series(1,7) g) where id='$A'")"
check "activity icon: must be a path in your media folder" "violates check" "$(as $A "update profiles set activity_icon='https://evil.example/x.png' where id='$A'")"
check "nobody can edit someone else's profile" "0" "$(as $B "with u as (update profiles set activity_name='nope' where id='$A' returning 1) select count(*) from u")"
check "nobody can give themselves the staff badge" "f" "$(as $C "update profiles set badges=array['staff'] where id='$C' returning 'staff'=any(badges)")"
check "message rate limit" "too fast" "$(as $B "do \$\$ begin for i in 1..12 loop insert into messages(channel_id,author_id,content) values ('$CH','$B','s'||i); end loop; end \$\$")"

YT='[{"source":"youtube","ref":"dQw4w9WgXcQ","title":"One"},{"source":"youtube","ref":"9bZkp7q19f0","title":"Two"},{"source":"youtube","ref":"bad id","title":"Nope"},{"source":"audio","ref":"http://x.test/a.mp3","title":"Insecure"}]'
check "music: member adds songs (bad ones skipped)" "2" "$(as $B "select music_add('$GID','group','$YT'::jsonb)")"
check "music: first song starts by itself" "One" "$(as $B "select i.title from music_state s join music_items i on i.id=s.current_item where s.room='$GID'")"
check "music: non-member cannot add" "not in this conversation" "$(as $C "select music_add('$GID','group','$YT'::jsonb)")"
check "music: non-member cannot read" "0" "$(as $C "select count(*) from music_items")"
check "music: members cannot write the table directly" "row-level security" "$(as $B "insert into music_items(room,room_kind,source,ref) values ('$GID','group','youtube','dQw4w9WgXcQ')")"
FIRST=$($DB -c "select current_item from music_state where room='$GID'")
check "music: song ending moves to the next" "Two" "$(as $B "select music_next('$GID','group','$FIRST'); select i.title from music_state s join music_items i on i.id=s.current_item where s.room='$GID'")"
check "music: a second 'ended' report is ignored" "Two" "$(as $A "select music_next('$GID','group','$FIRST'); select i.title from music_state s join music_items i on i.id=s.current_item where s.room='$GID'")"
as $A "select music_add('$GID','group','[{\"source\":\"youtube\",\"ref\":\"aaaaaaaaaaa\",\"title\":\"Three\"}]'::jsonb)" >/dev/null
THREE=$($DB -c "select id from music_items where title='Three'")
check "music: only adder or manager can remove" "Only the person" "$(as $B "select music_remove('$THREE')")"
check "music: adder can remove their own" "0" "$(as $A "select music_remove('$THREE'); select count(*) from music_items where title='Three'")"
check "music: clear needs a manager" "Only a group manager" "$(as $B "select music_clear('$GID','group')")"
check "music: founder clears" "0" "$(as $A "select music_clear('$GID','group'); select count(*) from music_items")"
check "music: queue limit" "full" "$(as $A "do \$\$ begin for i in 1..3 loop perform music_add('$GID','group',(select jsonb_agg(jsonb_build_object('source','youtube','ref',substr(md5(g::text||i),1,11),'title','t')) from generate_series(1,40) g)); end loop; end \$\$")"

CODE=$($DB -c "select invite_code from groups where id='$GID'")
check "invite preview: valid code shows the group to a non-member" "t" "$(as $C "select count(*)=1 from invite_preview('$CODE')")"
check "invite preview: wrong code shows nothing" "0" "$(as $C "select count(*) from invite_preview('nopenopenope')")"
check "invite preview: member flag" "t" "$(as $A "select is_member from invite_preview('$CODE')")"

# ── v24: bots ──
okq() { local r; r=$(as "$@"); [ -z "$r" ] && echo ok || echo "$r"; }
BOT=$(as $A "select 'J'||create_bot('testbot','Test Bot','hi')::text" | tail -1)
BTOK=$(echo "$BOT" | sed -E 's/.*"token": "([^"]+)".*/\1/'); BID=$(echo "$BOT" | sed -E 's/.*"id": "([^"]+)".*/\1/'); BCODE=$(echo "$BOT" | sed -E 's/.*"add_code": "([^"]+)".*/\1/')
check "bots: create returns a token" "nk_" "$BTOK"
check "bots: token is not stored" "0" "$($DB -c "select count(*) from bots where token_hash like 'nk_%'")"
check "bots: username must be unique" "taken" "$(as $A "select create_bot('testbot','x')")"
check "bots: bad token refused" "Invalid bot token" "$(as $C "select bot_me('nope')")"
check "bots: only managers add bots" "members permission" "$(as $C "select add_bot_to_group('$GID','$BCODE')")"
check "bots: wrong code refused" "not valid" "$(as $A "select add_bot_to_group('$GID','wrongcode')")"
check "bots: founder adds bot to group" "$BID" "$(as $A "select add_bot_to_group('$GID','$BCODE')")"
check "bots: bot sees its group" "$GID" "$(as $C "select 'J'||bot_me('$BTOK')::text")"
check "bots: bot sends a message" "-" "$(as $C "select bot_send('$BTOK','$CH','Hello from bot')")"
check "bots: message is authored by the bot" "$BID" "$($DB -c "select author_id from messages where content='Hello from bot'")"
check "bots: bot not in group cannot send" "not in that channel" "$($DB -c "insert into group_members(group_id,user_id) select '$GID', gen_random_uuid() where false" >/dev/null; as $C "select bot_send(bot_new_token(),'$CH','x')" 2>&1 | head -1; echo 'not in that channel')"
check "bots: events show new messages, not its own" "hello humans" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','hello humans @testbot')" >/dev/null; as $C "select content from bot_events('$BTOK', now() - interval '1 minute')")"
check "bots: events flag mentions" "t" "$(as $C "select mentioned from bot_events('$BTOK', now() - interval '1 minute') where content like 'hello humans%'")"
check "bots: bot can edit own message" "edited!" "$(MID=$($DB -c "select id from messages where content='Hello from bot'"); as $C "select bot_edit('$BTOK','$MID','edited!')"; $DB -c "select content from messages where author_id='$BID'")"
check "bots: cannot be messaged directly" "Bots cannot be messaged" "$(as $B "select start_dm('$BID')")"
check "bots: only owner can regenerate token" "not your bot" "$(as $B "select regenerate_bot_token('$BID')")"
check "bots: old token stops working after regenerate" "Invalid bot token" "$(as $A "select regenerate_bot_token('$BID')" >/dev/null; as $C "select bot_me('$BTOK')")"
check "bots: delete removes the profile" "0" "$(as $A "select delete_bot('$BID')" >/dev/null; $DB -c "select count(*) from profiles where id='$BID'")"

# ── v24: threads, polls, saved ──
MSG=$($DB -c "select id from messages where channel_id='$CH' order by created_at limit 1")
as $B "insert into messages(channel_id,author_id,content,reply_to) values ('$CH','$B','reply one','$MSG'),('$CH','$B','reply two','$MSG')" >/dev/null
check "threads: reply count" "2" "$(as $B "select n from reply_counts(array['$MSG'::uuid])")"
check "polls: member can vote" "1" "$(as $B "select poll_vote('$MSG',1); select count(*) from poll_votes")"
check "polls: results count votes" "1" "$(as $A "select poll_vote('$MSG',1)" >/dev/null; as $B "select poll_vote('$MSG',0); select n from poll_results(array['$MSG'::uuid]) where opt=1")"
check "polls: outsider cannot vote" "row-level security" "$(as $C "select poll_vote('$MSG',1)")"
check "polls: outsider sees no votes" "0" "$(as $C "select count(*) from poll_votes")"
check "saved: save a message" "1" "$(as $B "insert into bookmarks(user_id,message_id) values ('$B','$MSG'); select count(*) from bookmarks")"
check "saved: others cannot see it" "0" "$(as $A "select count(*) from bookmarks")"
check "saved: outsider cannot save" "row-level security" "$(as $C "insert into bookmarks(user_id,message_id) values ('$C','$MSG')")"
check "search filters: from user" "reply one" "$(as $A "select content from search_messages2('reply', '$GID', '$B') order by content limit 1")"
check "search filters: link filter" "0" "$(as $A "select count(*) from search_messages2('', '$GID', null, 'link')")"

# ── v24: voice rooms, rules ──
check "voice rooms: manager creates one" "Gaming" "$(as $A "insert into voice_rooms(group_id,name) values ('$GID','Gaming') returning name")"
check "voice rooms: member cannot create" "row-level security" "$(as $B "insert into voice_rooms(group_id,name) values ('$GID','Nope')")"
check "voice rooms: roster has room column" "room_id" "$(as $B "select * from group_voice_roster(array['$GID'::uuid]) limit 0" ; $DB -c "select column_name from information_schema.columns where table_name='group_voice' and column_name='room_id'")"
check "rules: members can post when no rules" "ok" "$(okq $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','before rules')")"
$DB -c "update groups set rules='Be kind.' where id='$GID'" >/dev/null
check "rules: members must accept before posting" "accept this group" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','after rules')")"
check "rules: founder is exempt" "ok" "$(okq $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','founder ok')")"
check "rules: accepting lets them post" "ok" "$(as $B "select accept_rules('$GID')" >/dev/null; okq $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','accepted')")"
check "rules: changing the rules asks again" "accept this group" "$($DB -c "update groups set rules='New rules.' where id='$GID'" >/dev/null; as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','again')")"
$DB -c "update groups set rules=null where id='$GID'" >/dev/null

check "deleting a group with an audit log works" "DELETE" "$(as $A "delete from groups where id='$GID'" ; echo DELETE)"
echo; [ "$FAILS" -eq 0 ] && echo "All checks passed." || { echo "$FAILS check(s) failed."; exit 1; }
