# Database tests

These run all of Nook's SQL on a throwaway local PostgreSQL (16 or newer) with small stand-ins for Supabase's own parts
(`stubs.sql`), then check real behaviour as signed-in users: permissions, limits, mentions, moderation, pins, search and more.

```
# 1. start any local postgres you can connect to as a superuser, for example:
#    initdb -D /tmp/pgdata -A trust -U postgres && pg_ctl -D /tmp/pgdata -o "-p 54329 -k /tmp/pgrun" start
# 2. run the tests (set PGHOST/PGPORT/PGUSER if yours differ from the defaults used here)
PGHOST=/tmp/pgrun PGPORT=54329 PGUSER=postgres bash supabase/tests/smoke.sh
```

It prints `ok` or `FAIL` for every check and exits with an error if any failed. It creates its own database called `nook_test`.
