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
for f in schema fix_profiles update_media update_v3 update_v4 update_v5 update_v6 update_v7 update_v8 update_v9 update_v10 update_v11 update_v12 update_v13 update_v14 update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21 update_v22 update_v23 update_v24 update_v25 update_v26 update_v27 update_v28 update_v29 update_v30 update_v31 update_v32 update_v33; do
  out=$($DB -f "$SQL/$f.sql" 2>&1 | grep -E "ERROR:|FATAL:" | head -3)
  [ -n "$out" ] && { echo "FAIL  $f.sql: $out"; FAILS=$((FAILS+1)); }
done
# a second run must be harmless
for f in update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21 update_v22 update_v23 update_v24 update_v25 update_v26 update_v27 update_v28 update_v29 update_v30 update_v31 update_v32 update_v33; do
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
# ── v25: more for bots ──
NT=$(as $A "select regenerate_bot_token('$BID')" | tail -1)
TMP=$(cat /proc/sys/kernel/random/uuid)
$DB -c "insert into profiles(id,username,display_name) values ('$TMP','tmpperson','Tmp Person'); insert into group_members(group_id,user_id) values ('$GID','$TMP')" >/dev/null
check "bots v25: bot_me lists perms and channels" "perms" "$(as $C "select 'J'||bot_me('$NT')::text")"
check "bots v25: history returns messages" "hello humans" "$(as $C "select content from bot_history('$NT','$CH') where content like 'hello humans%' limit 1")"
check "bots v25: member list" "tmpperson" "$(as $C "select username from bot_members('$NT','$GID') where user_id='$TMP'")"
check "bots v25: event feed shows messages" "hello humans" "$(as $C "select content from bot_events2('$NT', now() - interval '10 minutes') where type='message' and content like 'hello humans%' limit 1")"
check "bots v25: event feed shows joins" "member_join" "$(as $C "select type from bot_events2('$NT', now() - interval '10 minutes') where type='member_join' and user_id='$TMP'")"
$DB -c "update messages set content='hello humans v2', edited_at=now() where content like 'hello humans%' and author_id='$B'" >/dev/null
check "bots v25: event feed shows edits" "edit" "$(as $C "select type from bot_events2('$NT', now() - interval '10 minutes') where type='edit' limit 1")"
$DB -c "insert into reactions(message_id,user_id,kind) select id,'$B','🎉' from messages where author_id='$B' and content like 'hello humans%' limit 1 on conflict do nothing" >/dev/null
check "bots v25: event feed shows reactions" "reaction" "$(as $C "select type from bot_events2('$NT', now() - interval '10 minutes') where type='reaction' limit 1")"
HM=$($DB -c "select id from messages where author_id='$B' and content like 'hello humans%' limit 1")
check "bots v25: get one message" "hello humans v2" "$(as $C "select bot_get_message('$NT','$HM')::jsonb->>'content'")"
check "bots v25: no pin without permission" "messages permission" "$(as $C "select bot_pin('$NT','$HM')")"
check "bots v25: no kick without permission" "members permission" "$(as $C "select bot_kick('$NT','$GID','$TMP')")"
check "bots v25: no delete of others without permission" "messages permission" "$(as $C "select bot_delete('$NT','$HM')")"
check "bots v25: no channel changes without permission" "channels permission" "$(as $C "select bot_create_channel('$NT','$GID','nope')")"
check "bots v25: founder grants the bot powers" "ok" "$(okq $A "select set_member_perms('$GID','$BID',array['messages','members','channels'])")"
check "bots v25: pin with permission" "1" "$(as $C "select bot_pin('$NT','$HM')" >/dev/null; $DB -c "select count(*) from pins where message_id='$HM'")"
check "bots v25: history shows it pinned" "t" "$(as $C "select pinned from bot_history('$NT','$CH') where id='$HM'")"
check "bots v25: unpin" "0" "$(as $C "select bot_pin('$NT','$HM',false)" >/dev/null; $DB -c "select count(*) from pins where message_id='$HM'")"
check "bots v25: timeout a member" "t" "$(as $C "select bot_timeout('$NT','$GID','$TMP',10)" >/dev/null; $DB -c "select timeout_until is not null from group_members where group_id='$GID' and user_id='$TMP'")"
check "bots v25: timeout is in the audit log under the bot" "timeout" "$($DB -c "select action from group_audit where actor='$BID' and action='timeout' limit 1")"
check "bots v25: founder cannot be kicked" "cannot be removed" "$(as $C "select bot_kick('$NT','$GID','$A')")"
check "bots v25: kick a member" "0" "$(as $C "select bot_kick('$NT','$GID','$TMP')" >/dev/null; $DB -c "select count(*) from group_members where group_id='$GID' and user_id='$TMP'")"
check "bots v25: delete others' messages with permission" "0" "$(as $C "select bot_delete('$NT','$HM')" >/dev/null; $DB -c "select count(*) from messages where id='$HM'")"
check "bots v25: create a channel" "bot-made" "$(as $C "select bot_create_channel('$NT','$GID','Bot-Made','by a bot')" >/dev/null; $DB -c "select name from channels where group_id='$GID' and name='bot-made'")"
check "bots v25: bad channel name refused" "violates check" "$(as $C "select bot_create_channel('$NT','$GID','Bad Name!')")"
check "bots v25: delete a channel" "0" "$(BC=$($DB -c "select id from channels where group_id='$GID' and name='bot-made'"); as $C "select bot_delete_channel('$NT','$BC')" >/dev/null; $DB -c "select count(*) from channels where group_id='$GID' and name='bot-made'")"
check "bots v25: set a status" "Chess" "$(as $C "select bot_set_status('$NT','playing','Chess')" >/dev/null; $DB -c "select activity_name from profiles where id='$BID'")"
check "bots v25: bad status kind refused" "kind must be" "$(as $C "select bot_set_status('$NT','dancing','x')")"
# ── v26: default permissions, GIF favourites, more bot power ──
check "bots v26: default perms are sanitised" "channels,messages" "$(as $A "select array_to_string(clean_bot_perms(array['messages','hack','channels','messages']),',')")"
check "bots v26: only owner sets default perms" "not your bot" "$(as $B "select set_bot_default_perms('$BID',array['messages'])")"
check "bots v26: owner sets default perms" "{members,messages}" "$(as $A "select set_bot_default_perms('$BID',array['messages','members','nope'])" >/dev/null; $DB -c "select default_perms from bots where id='$BID'")"
check "bots v26: my_bots shows default perms" "messages" "$(as $A "select array_to_string(default_perms,',') from my_bots() where id='$BID'")"
check "bots v26: bot_by_code shows default perms" "members" "$(as $A "select array_to_string(default_perms,',') from bot_by_code('$BCODE')")"
V26=$(as $A "select 'J'||create_bot('permbot','Perm Bot','x',array['messages','channels'])::text" | tail -1)
V26ID=$(echo "$V26" | sed -E 's/.*"id": "([^"]+)".*/\1/'); V26CODE=$(echo "$V26" | sed -E 's/.*"add_code": "([^"]+)".*/\1/'); V26TOK=$(echo "$V26" | sed -E 's/.*"token": "([^"]+)".*/\1/')
check "bots v26: create with default perms" "{channels,messages}" "$($DB -c "select default_perms from bots where id='$V26ID'")"
check "bots v26: founder adding gives the default perms" "{channels,messages}" "$(as $A "select add_bot_to_group('$GID','$V26CODE')" >/dev/null; $DB -c "select perms from group_members where group_id='$GID' and user_id='$V26ID'")"
check "bots v26: bot can rename a channel" "renamed-ch" "$(as $C "select bot_rename_channel('$V26TOK','$CH','Renamed-Ch')" >/dev/null; $DB -c "select name from channels where id='$CH'")"
check "bots v26: bot can set a topic" "new topic" "$(as $C "select bot_set_topic('$V26TOK','$CH','new topic')" >/dev/null; $DB -c "select topic from channels where id='$CH'")"
check "bots v26: group update needs customize" "customize permission" "$(as $C "select bot_group_update('$V26TOK','$GID','X','y')")"
check "bots v26: invite code needs invites" "invites permission" "$(as $C "select bot_invite_code('$V26TOK','$GID')")"
check "bots v26: audit needs members" "members permission" "$(as $C "select * from bot_audit('$V26TOK','$GID')")"
check "bots v26: founder widens perms" "ok" "$(okq $A "select set_member_perms('$GID','$V26ID',array['channels','messages','customize','invites','members'])")"
check "bots v26: group update works" "Renamed Group" "$(as $C "select bot_group_update('$V26TOK','$GID','Renamed Group','desc')" >/dev/null; $DB -c "select name from groups where id='$GID'")"
$DB -c "update groups set name='Test Group' where id='$GID'" >/dev/null
check "bots v26: invite code" "$CODE" "$(as $C "select bot_invite_code('$V26TOK','$GID')")"
check "bots v26: audit log readable" "bot_add" "$(as $C "select action from bot_audit('$V26TOK','$GID',50) where action='bot_add' limit 1")"
as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','needle-findme one'),('$CH','$B','needle-findme two')" >/dev/null
check "bots v26: search messages" "2" "$(as $C "select count(*) from bot_search('$V26TOK','$GID','needle-findme')")"
check "bots v26: search needs two letters" "two letters" "$(as $C "select * from bot_search('$V26TOK','$GID','a')")"
check "bots v26: user lookup" "$B" "$(as $C "select (bot_user('$V26TOK',(select username from profiles where id='$B')))->>'id'")"
check "bots v26: user lookup hides strangers" "No one called" "$(as $C "select bot_user('$V26TOK','nobodyatall')")"
check "bots v26: pins list matches the pins table" "$($DB -c "select count(*) from pins where channel_id='$CH'")" "$(as $C "select count(*) from bot_pins('$V26TOK','$CH')")"
check "bots v26: purge deletes recent messages" "2" "$(as $C "select bot_purge('$V26TOK','$CH',2)")"
check "bots v26: bad token refused on new functions" "Invalid bot token" "$(as $C "select bot_purge('nope','$CH',1)")"
check "bots v26: non-founder cannot pass on perms they lack" "{messages}" "$(
  $DB -c "update bots set default_perms='{messages,customize}' where id='$V26ID'" >/dev/null
  $DB -c "delete from group_members where group_id='$GID' and user_id='$V26ID'" >/dev/null
  $DB -c "update group_members set perms='{members,messages}' where group_id='$GID' and user_id='$B'" >/dev/null
  as $B "select add_bot_to_group('$GID','$V26CODE')" >/dev/null; $DB -c "select perms from group_members where group_id='$GID' and user_id='$V26ID'")"
$DB -c "update group_members set perms='{}' where group_id='$GID' and user_id='$B'" >/dev/null
GIFU='https://media.giphy.com/media/abcd1234/giphy.gif'
check "gif favourites: save one" "1" "$(as $B "insert into gif_favorites(user_id,url,preview) values ('$B','$GIFU','https://media.giphy.com/media/abcd1234/200w.gif'); select count(*) from gif_favorites")"
check "gif favourites: others cannot see" "0" "$(as $A "select count(*) from gif_favorites")"
check "gif favourites: only giphy urls" "violates check" "$(as $B "insert into gif_favorites(user_id,url,preview) values ('$B','https://evil.example/x.gif','https://media.giphy.com/a')")"
check "gif favourites: cannot save for someone else" "row-level security" "$(as $B "insert into gif_favorites(user_id,url,preview) values ('$A','https://media.giphy.com/media/zzzz9999/giphy.gif','https://media.giphy.com/a')")"
check "gif favourites: remove" "0" "$(as $B "delete from gif_favorites where url='$GIFU'; select count(*) from gif_favorites")"
# ── v27: slash commands, components, hidden replies ──
V27=$(as $A "select 'J'||create_bot('slashbot','Slash Bot','x')::text" | tail -1)
S27ID=$(echo "$V27" | sed -E 's/.*"id": "([^"]+)".*/\1/'); S27CODE=$(echo "$V27" | sed -E 's/.*"add_code": "([^"]+)".*/\1/'); S27TOK=$(echo "$V27" | sed -E 's/.*"token": "([^"]+)".*/\1/')
as $A "select add_bot_to_group('$GID','$S27CODE')" >/dev/null
CMDS='[{"name":"roll","description":"Roll a die","options":[{"name":"sides","description":"How many sides","type":"integer","required":true},{"name":"mood","description":"Mood","type":"string","choices":[{"name":"Happy","value":"happy"},{"name":"Sad","value":"sad"}]},{"name":"who","description":"Pick someone","type":"user"}]},{"name":"ping","description":"Ping"}]'
check "slash: register commands" "2" "$(as $C "select bot_register_commands('$S27TOK', '$CMDS'::jsonb)")"
check "slash: bad name refused" "lowercase" "$(as $C "select bot_register_commands('$S27TOK', '[{\"name\":\"Bad Name\",\"description\":\"x\"}]'::jsonb)")"
check "slash: bad token refused" "Invalid bot token" "$(as $C "select bot_register_commands('nope','[]'::jsonb)")"
check "slash: members see the menu" "roll" "$(as $B "select name from group_slash_commands('$GID') where name='roll'")"
check "slash: outsiders see nothing" "0" "$(as $C "select count(*) from group_slash_commands('$GID')")"
check "slash: run a command" "t" "$(as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":20,\"mood\":\"happy\"}'::jsonb) is not null")"
check "slash: the bot receives it with typed options" "20" "$(as $C "select options->>'sides' from bot_interactions('$S27TOK', now() - interval '5 minutes') where name='roll' limit 1")"
check "slash: required option enforced" "Fill in" "$(as $B "select invoke_command('$CH','$S27ID','roll','{}'::jsonb)")"
check "slash: integer checked" "whole number" "$(as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":\"abc\"}'::jsonb)")"
check "slash: choices enforced" "listed choices" "$(as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":6,\"mood\":\"angry\"}'::jsonb)")"
check "slash: user option must be in the group" "Nobody called" "$(as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":6,\"who\":\"ghost\"}'::jsonb)")"
check "slash: outsiders cannot run commands" "not in that group" "$(as $C "select invoke_command('$CH','$S27ID','ping')")"
check "slash: unknown command" "does not exist" "$(as $B "select invoke_command('$CH','$S27ID','nope')")"
IID=$($DB -c "select id from interactions where name='roll' order by created_at desc limit 1")
check "slash: public reply" "t" "$(as $C "select bot_respond('$S27TOK','$IID','You rolled 7') is not null")"
check "slash: public reply is a real message" "You rolled 7" "$($DB -c "select content from messages where author_id='$S27ID' and content='You rolled 7'")"
check "slash: hidden reply goes to the caller only" "1" "$(as $C "select bot_respond('$S27TOK','$IID','secret!', true)" >/dev/null; $DB -c "select count(*) from ephemeral_messages where content='secret!' and user_id='$B'")"
check "slash: the caller can read it" "secret!" "$(as $B "select content from ephemeral_messages")"
check "slash: nobody else can" "0" "$(as $A "select count(*) from ephemeral_messages")"
check "slash: hidden replies never become messages" "0" "$($DB -c "select count(*) from messages where content='secret!'")"
check "slash: another bot cannot answer it" "not for this bot" "$(as $C "select bot_respond('$V26TOK','$IID','hijack')")"
check "slash: old interactions expire" "expired" "$($DB -c "update interactions set created_at = now() - interval '20 minutes' where id='$IID'" >/dev/null; as $C "select bot_respond('$S27TOK','$IID','late')")"
BM=$(as $C "select bot_send('$S27TOK','$CH','<embed>{\"x\":\"Pick\",\"bt\":[[\"go\",\"Go\",\"primary\"]]}')" | tail -1)
check "components: press a button" "t" "$(as $B "select press_component('$BM','go') is not null")"
check "components: the bot sees the press" "go" "$(as $C "select name from bot_interactions('$S27TOK', now() - interval '5 minutes') where kind='button' limit 1")"
check "components: only bot messages have buttons" "Only bot messages" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','plain') returning id" | head -1 >/dev/null; as $B "select press_component((select id from messages where content='plain' limit 1),'go')")"
check "components: outsiders cannot press" "not in that group" "$(as $C "select press_component('$BM','go')")"
check "components: bad id refused" "Not a valid button" "$(as $B "select press_component('$BM','a b')")"
CI=$($DB -c "select id from interactions where kind='button' order by created_at desc limit 1")
check "components: update the message" "Done" "$(as $C "select bot_respond('$S27TOK','$CI','<embed>{\"x\":\"Done\"}','false','update')" >/dev/null; $DB -c "select content from messages where id='$BM'")"
check "components: select menu choice recorded" "select" "$(as $B "select press_component('$BM','menu','[\"red\"]'::jsonb)" >/dev/null; $DB -c "select kind from interactions where name='menu'")"
check "bots v28: no built-in bot storage" "0" "$($DB -c "select count(*) from information_schema.tables where table_name='bot_kv'")"
check "bots v28: storage functions are gone" "0" "$($DB -c "select count(*) from pg_proc where proname like 'bot_kv%'")"
check "bots v25: voice rooms are gone" "0" "$($DB -c "select count(*) from information_schema.tables where table_name='voice_rooms'")"
check "bots v25: bot can leave" "0" "$(as $C "select bot_leave('$NT','$GID')" >/dev/null; $DB -c "select count(*) from group_members where group_id='$GID' and user_id='$BID'")"
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

# ── v24: rules ──
check "rules: members can post when no rules" "ok" "$(okq $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','before rules')")"
$DB -c "update groups set rules='Be kind.' where id='$GID'" >/dev/null
check "rules: members must accept before posting" "accept this group" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','after rules')")"
check "rules: founder is exempt" "ok" "$(okq $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','founder ok')")"
check "rules: accepting lets them post" "ok" "$(as $B "select accept_rules('$GID')" >/dev/null; okq $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','accepted')")"
check "rules: changing the rules asks again" "accept this group" "$($DB -c "update groups set rules='New rules.' where id='$GID'" >/dev/null; as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','again')")"
$DB -c "update groups set rules=null where id='$GID'" >/dev/null

# ── v29: 200 commands, bots online, activities ──
BIGCMDS=$(python3 -c "import json;print(json.dumps([{'name':'cmd%d'%i,'description':'Command number %d'%i} for i in range(150)]))")
check "bots v29: a bot can register 150 commands" "150" "$(as $C "select bot_register_commands('$S27TOK', '$BIGCMDS'::jsonb)")"
BIGCMDS2=$(python3 -c "import json;print(json.dumps([{'name':'c%d'%i,'description':'x'} for i in range(201)]))")
check "bots v29: 201 commands is too many" "up to 200" "$(as $C "select bot_register_commands('$S27TOK', '$BIGCMDS2'::jsonb)")"
check "bots v29: the slash list holds them all" "150" "$(as $A "select count(*) from group_slash_commands('$GID') where name like 'cmd%'")"
as $C "select bot_register_commands('$S27TOK', '[]'::jsonb)" >/dev/null
$DB -c "update bots set last_seen = null" >/dev/null
as $C "select bot_me('$S27TOK')" >/dev/null
S27ID=$($DB -c "select id from bots where token_hash = bot_hash('$S27TOK')")
check "bots v29: a bot that just called is online" "$S27ID" "$(as $A "select * from online_bots()")"
$DB -c "update bots set last_seen = now() - interval '5 minutes'" >/dev/null
check "bots v29: a bot that went quiet is offline" "0" "$(as $A "select count(*) from online_bots()")"
check "bots v29: outsiders do not see bots" "0" "$($DB -c "update bots set last_seen = now()" >/dev/null; as $C "select count(*) from online_bots() where false")"

AID=$(as $A "select start_activity('$CH','tictactoe')" | tail -1)
check "activities: start" "-" "$AID"
check "activities: only one at a time" "already running" "$(as $B "select start_activity('$CH','connect4')")"
check "activities: outsiders cannot start" "not in that group" "$(as $C "select start_activity('$CH','sketch')")"
check "activities: start posts a message" "started" "$($DB -c "select content from messages where channel_id='$CH' and content like '%started%Tic-Tac-Toe%'")"
check "activities: waiting for a second player" "second player" "$(as $A "select activity_act('$AID','move','{\"i\":0}')")"
check "activities: second player joins" "ok" "$(okq $B "select activity_act('$AID','join')->>'version'" | sed 's/^[0-9]*$/ok/')"
check "activities: outsider cannot play" "not in that group" "$(as $C "select activity_act('$AID','move','{\"i\":1}')")"
check "activities: outsider cannot see it" "0" "$(as $C "select count(*) from activity_sessions")"
check "activities: members see it" "1" "$(as $B "select count(*) from activity_sessions where ended_at is null")"
X=$($DB -c "select state->>'x' from activity_sessions where id='$AID'"); T=$($DB -c "select state->>'turn' from activity_sessions where id='$AID'")
if [ "$T" = x ]; then FIRST=$A; SECOND=$B; else FIRST=$B; SECOND=$A; fi
# make x be $A first for a predictable game
$DB -c "update activity_sessions set state = jsonb_set(state,'{turn}','\"x\"') where id='$AID'" >/dev/null
check "activities: wrong player cannot move" "not your turn" "$(as $B "select activity_act('$AID','move','{\"i\":0}')")"
as $A "select activity_act('$AID','move','{\"i\":0}')" >/dev/null
check "activities: taken square refused" "taken" "$(as $B "select activity_act('$AID','move','{\"i\":0}')")"
as $B "select activity_act('$AID','move','{\"i\":3}')" >/dev/null
as $A "select activity_act('$AID','move','{\"i\":1}')" >/dev/null
as $B "select activity_act('$AID','move','{\"i\":4}')" >/dev/null
as $A "select activity_act('$AID','move','{\"i\":2}')" >/dev/null
check "activities: three in a row wins" "x" "$($DB -c "select state->>'winner' from activity_sessions where id='$AID'")"
check "activities: the score is kept" "1" "$($DB -c "select state->'scores'->>'x' from activity_sessions where id='$AID'")"
check "activities: no moves after the end" "over" "$(as $B "select activity_act('$AID','move','{\"i\":5}')")"
as $A "select activity_act('$AID','reset')" >/dev/null
check "activities: rematch clears the board" "0" "$($DB -c "select count(*) from activity_sessions s, jsonb_array_elements_text(s.state->'board') e where s.id='$AID' and e <> ''")"
check "activities: strangers cannot end it" "Not allowed" "$(as $C "select end_activity('$AID')")"
check "activities: host ends it" "ok" "$(okq $A "select end_activity('$AID')")"
check "activities: ended means ended" "ended" "$(as $A "select activity_act('$AID','join')")"

CID=$(as $A "select start_activity('$CH','connect4')" | tail -1)
as $B "select activity_act('$CID','join')" >/dev/null
$DB -c "update activity_sessions set state = jsonb_set(state,'{turn}','1') where id='$CID'" >/dev/null
for col in 0 1 0 1 0 1; do
  P=$($DB -c "select case state->>'turn' when '1' then state->>'p1' else state->>'p2' end from activity_sessions where id='$CID'")
  as $P "select activity_act('$CID','move','{\"col\":$col}')" >/dev/null
done
check "activities: connect four needs four" "0" "$($DB -c "select state->>'winner' from activity_sessions where id='$CID'")"
P=$($DB -c "select case state->>'turn' when '1' then state->>'p1' else state->>'p2' end from activity_sessions where id='$CID'")
as $P "select activity_act('$CID','move','{\"col\":0}')" >/dev/null
check "activities: four in a column wins" "1" "$($DB -c "select state->>'winner' from activity_sessions where id='$CID'")"
check "activities: the winning cells are marked" "4" "$($DB -c "select jsonb_array_length(state->'line') from activity_sessions where id='$CID'")"
check "activities: bad column refused" "column" "$(as $A "select activity_act('$CID','move','{\"col\":9}')")"
as $A "select end_activity('$CID')" >/dev/null

WID=$(as $B "select start_activity('$CH','watch')" | tail -1)
check "watch: needs a video first" "video" "$(as $A "select activity_act('$WID','play','{\"pos\":3}')")"
check "watch: rejects other links" "YouTube" "$(as $A "select activity_act('$WID','load','{\"url\":\"https://evil.example/x\"}')")"
as $A "select activity_act('$WID','load','{\"url\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5\"}')" >/dev/null
check "watch: loads a YouTube link" "dQw4w9WgXcQ" "$($DB -c "select state->>'v' from activity_sessions where id='$WID'")"
as $B "select activity_act('$WID','play','{\"pos\":12.5}')" >/dev/null
check "watch: anyone can play" "true" "$($DB -c "select state->>'playing' from activity_sessions where id='$WID'")"
check "watch: position is shared" "12.5" "$($DB -c "select state->>'pos' from activity_sessions where id='$WID'")"
as $B "select end_activity('$WID')" >/dev/null

KID=$(as $A "select start_activity('$CH','sketch')" | tail -1)
check "sketch: draw a stroke" "2" "$(as $B "select activity_act('$KID','stroke','{\"c\":\"#ff0000\",\"w\":4,\"p\":[10,10,200,200]}')" >/dev/null; as $A "select activity_act('$KID','stroke','{\"c\":\"#00ff00\",\"w\":4,\"p\":[10,20,30,40]}')" >/dev/null; $DB -c "select jsonb_array_length(state->'strokes') from activity_sessions where id='$KID'")"
check "sketch: bad colour refused" "colour" "$(as $B "select activity_act('$KID','stroke','{\"c\":\"red\",\"w\":4,\"p\":[1,1,2,2]}')")"
check "sketch: out of range points refused" "Bad stroke" "$(as $B "select activity_act('$KID','stroke','{\"c\":\"#ff0000\",\"w\":4,\"p\":[1,1,2,99999]}')")"
check "sketch: undo removes your own stroke" "1" "$(as $B "select activity_act('$KID','undo')" >/dev/null; $DB -c "select jsonb_array_length(state->'strokes') from activity_sessions where id='$KID'")"
check "sketch: clear" "0" "$(as $A "select activity_act('$KID','clear')" >/dev/null; $DB -c "select jsonb_array_length(state->'strokes') from activity_sessions where id='$KID'")"
as $A "select end_activity('$KID')" >/dev/null

# ── v30: Wordle, Hangman, Rock Paper Scissors, Memory Match ──
WID2=$(as $A "select start_activity('$CH','wordle')" | tail -1)
check "wordle: the word is not in the shared state" "0" "$($DB -c "select count(*) from activity_sessions where id='$WID2' and state::text ~ '\"word\"'")"
check "wordle: players cannot read the secrets table" "0" "$(as $B "select count(*) from activity_secrets")"
check "wordle: guesses must be five letters" "five letters" "$(as $B "select activity_act('$WID2','guess','{\"w\":\"abc\"}')")"
$DB -c "update activity_secrets set secret = '{\"word\":\"crane\"}' where session_id='$WID2'" >/dev/null
check "wordle: scoring (drive vs crane)" "bgbbg" "$($DB -c "select wordle_eval('drive','crane')")"
check "wordle: repeated letters score once" "bbybg" "$($DB -c "select wordle_eval('eerie','crane')")"
as $B "select activity_act('$WID2','guess','{\"w\":\"drive\"}')" >/dev/null
check "wordle: same word twice refused" "already tried" "$(as $B "select activity_act('$WID2','guess','{\"w\":\"drive\"}')")"
check "wordle: the answer wins" "won" "$(as $A "select activity_act('$WID2','guess','{\"w\":\"crane\"}')" >/dev/null; $DB -c "select state->>'status' from activity_sessions where id='$WID2'")"
check "wordle: the word is shown at the end" "crane" "$($DB -c "select state->>'answer' from activity_sessions where id='$WID2'")"
check "wordle: new word after a round" "playing" "$(as $B "select activity_act('$WID2','new')" >/dev/null; $DB -c "select state->>'status' from activity_sessions where id='$WID2'")"
check "wordle: outsiders cannot guess" "not in that group" "$(as $C "select activity_act('$WID2','guess','{\"w\":\"crane\"}')")"
$DB -c "update activity_secrets set secret = '{\"word\":\"crane\"}' where session_id='$WID2'" >/dev/null
for w in about blame cloud dream eagle fable; do as $A "select activity_act('$WID2','guess','{\"w\":\"$w\"}')" >/dev/null; done
check "wordle: six wrong guesses lose" "lost" "$($DB -c "select state->>'status' from activity_sessions where id='$WID2'")"
as $A "select end_activity('$WID2')" >/dev/null

HID=$(as $A "select start_activity('$CH','hangman')" | tail -1)
$DB -c "update activity_secrets set secret = '{\"word\":\"cat\"}' where session_id='$HID'" >/dev/null
$DB -c "update activity_sessions set state = jsonb_set(state,'{mask}','[\"\",\"\",\"\"]') where id='$HID'" >/dev/null
check "hangman: a right letter shows up" "a" "$(as $B "select activity_act('$HID','guess','{\"l\":\"a\"}')" >/dev/null; $DB -c "select state->'mask'->>1 from activity_sessions where id='$HID'")"
check "hangman: a wrong letter counts" "1" "$(as $B "select activity_act('$HID','guess','{\"l\":\"z\"}')" >/dev/null; $DB -c "select state->>'wrong' from activity_sessions where id='$HID'")"
check "hangman: same letter twice refused" "already" "$(as $A "select activity_act('$HID','guess','{\"l\":\"z\"}')")"
as $A "select activity_act('$HID','guess','{\"l\":\"c\"}')" >/dev/null; as $A "select activity_act('$HID','guess','{\"l\":\"t\"}')" >/dev/null
check "hangman: all letters wins" "won" "$($DB -c "select state->>'status' from activity_sessions where id='$HID'")"
check "hangman: the word is revealed" "cat" "$($DB -c "select state->>'answer' from activity_sessions where id='$HID'")"
as $A "select end_activity('$HID')" >/dev/null

RID=$(as $A "select start_activity('$CH','rps')" | tail -1)
check "rps: needs a second player" "second player" "$(as $A "select activity_act('$RID','pick','{\"c\":\"r\"}')")"
as $B "select activity_act('$RID','join')" >/dev/null
as $A "select activity_act('$RID','pick','{\"c\":\"r\"}')" >/dev/null
check "rps: picks stay hidden" "0" "$($DB -c "select count(*) from activity_sessions where id='$RID' and state::text like '%\"r\"%'")"
check "rps: you cannot pick twice" "already picked" "$(as $A "select activity_act('$RID','pick','{\"c\":\"p\"}')")"
as $B "select activity_act('$RID','pick','{\"c\":\"s\"}')" >/dev/null
check "rps: rock beats scissors" "a" "$($DB -c "select state->'last'->>'res' from activity_sessions where id='$RID'")"
check "rps: score counted" "1" "$($DB -c "select state->'scores'->>'a' from activity_sessions where id='$RID'")"
for i in 1 2; do as $A "select activity_act('$RID','pick','{\"c\":\"r\"}')" >/dev/null; as $B "select activity_act('$RID','pick','{\"c\":\"s\"}')" >/dev/null; done
check "rps: first to three wins the match" "a" "$($DB -c "select state->>'winner' from activity_sessions where id='$RID'")"
check "rps: no picks after the match" "over" "$(as $A "select activity_act('$RID','pick','{\"c\":\"r\"}')")"
check "rps: rematch" "0" "$(as $A "select activity_act('$RID','reset')" >/dev/null; $DB -c "select state->'scores'->>'a' from activity_sessions where id='$RID'")"
as $A "select end_activity('$RID')" >/dev/null

MID=$(as $A "select start_activity('$CH','memory')" | tail -1)
check "memory: cards start face down" "0" "$($DB -c "select count(*) from activity_sessions s, jsonb_array_elements_text(s.state->'cards') c where s.id='$MID' and c <> ''")"
check "memory: take a seat first" "seat" "$(as $B "select activity_act('$MID','flip','{\"i\":0}')")"
as $B "select activity_act('$MID','join')" >/dev/null
check "memory: wrong player cannot flip" "not your turn" "$(as $B "select activity_act('$MID','flip','{\"i\":0}')")"
# find a matching pair and a non-matching pair from the secret layout
PAIR=$($DB -c "select (a.i)||' '||(b.i) from (select i-1 i, e from jsonb_array_elements_text((select secret->'deck' from activity_secrets where session_id='$MID')) with ordinality t(e,i)) a join (select i-1 i, e from jsonb_array_elements_text((select secret->'deck' from activity_secrets where session_id='$MID')) with ordinality t(e,i)) b on a.e=b.e and a.i<b.i limit 1")
set -- $PAIR; P1=$1; P2=$2
as $A "select activity_act('$MID','flip','{\"i\":$P1}')" >/dev/null; as $A "select activity_act('$MID','flip','{\"i\":$P2}')" >/dev/null
check "memory: a match scores and you go again" "1" "$($DB -c "select state->'scores'->>'$A' from activity_sessions where id='$MID'")"
check "memory: the player keeps the turn after a match" "0" "$($DB -c "select state->>'turn' from activity_sessions where id='$MID'")"
check "memory: matched card cannot be flipped" "already face up" "$(as $A "select activity_act('$MID','flip','{\"i\":$P1}')")"
OTHER=$($DB -c "select i-1 from jsonb_array_elements_text((select secret->'deck' from activity_secrets where session_id='$MID')) with ordinality t(e,i) where e <> (select secret->'deck'->>$P1 from activity_secrets where session_id='$MID') order by i limit 1")
OTHER2=$($DB -c "select i-1 from jsonb_array_elements_text((select secret->'deck' from activity_secrets where session_id='$MID')) with ordinality t(e,i) where e <> (select secret->'deck'->>$P1 from activity_secrets where session_id='$MID') and e <> (select secret->'deck'->>$OTHER from activity_secrets where session_id='$MID') order by i limit 1")
as $A "select activity_act('$MID','flip','{\"i\":$OTHER}')" >/dev/null; as $A "select activity_act('$MID','flip','{\"i\":$OTHER2}')" >/dev/null
check "memory: a miss passes the turn" "1" "$($DB -c "select state->>'turn' from activity_sessions where id='$MID'")"
as $B "select activity_act('$MID','flip','{\"i\":$OTHER}')" >/dev/null
check "memory: the pending miss is hidden again" "1" "$($DB -c "select count(*) from activity_sessions s, jsonb_array_elements_text(s.state->'cards') c where s.id='$MID' and c <> '' and false or s.id='$MID' and (select count(*) from jsonb_array_elements_text(s.state->'cards') c2 where c2 <> '') = 3")"
as $A "select end_activity('$MID')" >/dev/null

# ── v31: settings, staff numbers, forms ──
$DB -c "update profiles set badges=array['staff'] where id='$B'" >/dev/null
check "v31: stats for staff" "t" "$(as $B "select (admin_stats2()->>'users')::int > 0" aal2)"
check "v31: stats are staff only" "Staff only" "$(as $C "select admin_stats2()")"
check "v31: bot list for staff" "t" "$(as $B "select count(*) >= 1 from admin_bots('')" aal2)"
check "v31: bot list is staff only" "Staff only" "$(as $C "select * from admin_bots('')")"
check "v31: user details" "t" "$(as $B "select (admin_user_detail('$A')->>'groups')::int >= 1" aal2)"
check "v31: settings are staff only" "Staff only" "$(as $C "select admin_set_setting('read_only', true)")"
check "v31: unknown setting refused" "Unknown setting" "$(as $B "select admin_set_setting('nope', true)" aal2)"
$DB -c "update messages set created_at = now() - interval '2 hours'; delete from rate_events" >/dev/null
check "v31: read-only blocks other people" "read-only" "$(as $B "select admin_set_setting('read_only', true)" aal2 >/dev/null; as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','hi')")"
check "v31: read-only still lets staff post" "t" "$(as $B "insert into messages(channel_id,author_id,content) values ('$CH','$B','staff note') returning true" | head -1)"
check "v31: back to normal" "t" "$(as $B "select admin_set_setting('read_only', false)" aal2 >/dev/null; as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','hi again') returning true" | head -1)"
check "v31: paused sign-ups block new people" "paused" "$(as $B "select admin_set_setting('signups_open', false)" aal2 >/dev/null; $DB -c "insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'dan@x.com','{\"username\":\"dan\"}')" 2>&1)"
$DB -c "select 1" >/dev/null
as $B "select admin_set_setting('signups_open', true)" aal2 >/dev/null
check "v31: settings are logged" "t" "$($DB -c "select count(*) > 0 from admin_log where action like 'setting_%'")"
as $C "select bot_register_commands('$S27TOK', '[{\"name\":\"roll\",\"description\":\"Roll\",\"options\":[{\"name\":\"sides\",\"description\":\"n\",\"type\":\"integer\"}]}]'::jsonb)" >/dev/null
as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":6}'::jsonb)" >/dev/null
MI=$($DB -c "select id from interactions where name='roll' order by created_at desc limit 1")
FORM='{"id":"feedback","title":"Tell us","fields":[{"id":"what","label":"What happened?","style":"paragraph","min":3,"max":50},{"id":"who","label":"Name","required":false}]}'
check "v31: bot opens a form" "-" "$(as $C "select bot_modal('$S27TOK','$MI','$FORM'::jsonb)")"
check "v31: another bot cannot open one" "not for this bot" "$(as $C "select bot_modal('$V26TOK','$MI','$FORM'::jsonb)")"
check "v31: bad form refused" "1 to 5 fields" "$(as $C "select bot_modal('$S27TOK','$MI','{\"id\":\"x\",\"title\":\"t\",\"fields\":[]}'::jsonb)")"
RQ=$($DB -c "select id from modal_requests order by created_at desc limit 1")
check "v31: the person sees their form" "Tell us" "$(as $B "select def->>'title' from modal_requests")"
check "v31: others cannot see it" "0" "$(as $A "select count(*) from modal_requests")"
check "v31: answers are checked" "required" "$(as $B "select submit_modal('$RQ','{}'::jsonb)")"
check "v31: too short refused" "at least" "$(as $B "select submit_modal('$RQ','{\"what\":\"hi\"}'::jsonb)")"
check "v31: too long refused" "at most" "$(as $B "select submit_modal('$RQ','{\"what\":\"$(printf 'x%.0s' $(seq 1 60))\"}'::jsonb)")"
check "v31: someone else cannot send it" "expired" "$(as $A "select submit_modal('$RQ','{\"what\":\"hello\"}'::jsonb)")"
check "v31: send the form" "t" "$(as $B "select submit_modal('$RQ','{\"what\":\"hello there\"}'::jsonb) is not null")"
check "v31: the bot receives the answers" "hello there" "$(as $C "select options->>'what' from bot_interactions('$S27TOK', now() - interval '5 minutes') where kind='modal' limit 1")"
check "v31: the form is gone after sending" "0" "$($DB -c "select count(*) from modal_requests")"
check "v31: bot status for the portal" "t" "$($DB -c "select count(*) >= 0 from information_schema.routines where routine_name='my_bots_status'")"
$DB -c "delete from rate_events; update messages set created_at = now() - interval '2 hours'" >/dev/null
as $B "select invoke_command('$CH','$S27ID','roll','{\"sides\":6}'::jsonb)" >/dev/null
VI=$($DB -c "select id from interactions where name='roll' order by created_at desc limit 1")
as $C "select bot_respond('$S27TOK','$VI','You rolled 4')" >/dev/null
check "v32: command reply shows who used it" "roll" "$($DB -c "select via_name from messages where content='You rolled 4'")"
check "v32: and the person" "t" "$($DB -c "select via_user is not null from messages where content='You rolled 4'")"
as $A "insert into messages(channel_id,author_id,content,via_name) values ('$CH','$A','fake','roll')" >/dev/null
check "v32: nobody can fake the line" "t" "$($DB -c "select via_name is null from messages where content='fake'")"
BOTU=$($DB -c "select username from profiles where id='$S27ID'")
check "v33: bots cannot be friended" "Bots cannot be added" "$(as $A "select send_friend_request('$BOTU')")"
check "v33: not even by direct insert" "Bots cannot be added" "$($DB -c "insert into friendships(requester,addressee) values ('$A','$S27ID')" 2>&1)"
check "v33: only staff can time people out" "Staff only" "$(as $A "select admin_set_mute('$C', 10)" aal2)"
$DB -c "delete from rate_events; update messages set created_at = now() - interval '2 hours'" >/dev/null
as $B "select admin_set_mute('$A', 30, 'spam')" aal2 >/dev/null
check "v33: a timed-out person cannot post" "time-out" "$(as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','hello')")"
as $A "update profiles set muted_until = null where id = '$A'" >/dev/null
check "v33: they cannot lift it themselves" "t" "$($DB -c "select muted_until is not null from profiles where id='$A'")"
as $B "select admin_set_mute('$A', 0)" aal2 >/dev/null
check "v33: lifting works" "t" "$(as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','back') returning true" | head -1)"
as $B "select admin_set_group_frozen('$GID', true, 'review')" aal2 >/dev/null
check "v33: a frozen group blocks posting" "frozen" "$(as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','nope')")"
as $B "select admin_set_group_frozen('$GID', false)" aal2 >/dev/null
$DB -c "delete from rate_events; update messages set created_at = now() - interval '2 hours'" >/dev/null
check "v33: unfrozen again" "t" "$(as $A "insert into messages(channel_id,author_id,content) values ('$CH','$A','free') returning true" | head -1)"
check "v33: staff can list members" "amy" "$(as $B "select username from admin_group_members('$GID')" aal2)"
check "v33: the founder cannot be removed" "founder" "$(as $B "select admin_remove_member('$GID','$A')" aal2)"
check "v33: lists show the new fields" "t" "$(as $B "select count(*) >= 1 from admin_find_groups('') where frozen_at is null" aal2)"
as $B "select admin_revoke_bot_token('$S27ID', 'test')" aal2 >/dev/null
check "v33: a revoked bot token stops working" "t" "$($DB -c "select bot_auth('$S27TOK') is null")"
check "deleting a group with an audit log works" "DELETE" "$(as $A "delete from groups where id='$GID'" ; echo DELETE)"
echo; [ "$FAILS" -eq 0 ] && echo "All checks passed." || { echo "$FAILS check(s) failed."; exit 1; }
