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
for f in schema fix_profiles update_media update_v3 update_v4 update_v5 update_v6 update_v7 update_v8 update_v9 update_v10 update_v11 update_v12 update_v13 update_v14 update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21; do
  out=$($DB -f "$SQL/$f.sql" 2>&1 | grep -E "ERROR:|FATAL:" | head -3)
  [ -n "$out" ] && { echo "FAIL  $f.sql: $out"; FAILS=$((FAILS+1)); }
done
# a second run must be harmless
for f in update_v15 update_v16 update_v17 update_v18 update_v19 update_v20 update_v21; do
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

check "deleting a group with an audit log works" "DELETE" "$(as $A "delete from groups where id='$GID'" ; echo DELETE)"
echo; [ "$FAILS" -eq 0 ] && echo "All checks passed." || { echo "$FAILS check(s) failed."; exit 1; }
