"""nook-bot (v4): the Python library for Nook bots. No dependencies, needs Python 3.8 or newer.

Install:  pip install https://YOUR-SITE/sdk/nook_bot-4.0.0-py3-none-any.whl      Guide: https://YOUR-SITE/developers

    from nook_bot import NookBot

    bot = NookBot()                      # reads NOOK_KEY from the environment or from a .env file

    @bot.command('ping', description='Check that I am awake')
    def ping(m, args):
        m.reply('pong!')

    bot.run()

Bots keep their own data (SQLite, MySQL, a JSON file...). Nook stores nothing for a bot between restarts.
"""
import base64
import json
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

__version__ = '4.0.0'
__all__ = ['NookBot', 'NookError', 'encode_message', 'encode_poll']


class NookError(Exception):
    """Something Nook refused (wrong key, missing permission, rate limit...). The message says what."""

    def __init__(self, message, status=None, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


class Obj(dict):
    """A dict you can also read with dots: m.content, i.options.sides"""

    def __getattribute__(self, k):
        # a stored key wins over a dict method of the same name, so i.update(...) and i.values work as written
        if not k.startswith('__') and dict.__contains__(self, k):
            v = dict.__getitem__(self, k)
            return Obj(v) if isinstance(v, dict) and not isinstance(v, Obj) else v
        return object.__getattribute__(self, k)

    def __getattr__(self, k):
        return None

    def __setattr__(self, k, v):
        self[k] = v


def _load_env(path='.env'):
    """A .env file next to your bot (NOOK_KEY=nkc_...) is read automatically. Real environment variables win."""
    try:
        with open(path, encoding='utf-8-sig') as f:
            for line in f:
                m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$', line)
                if m and not line.lstrip().startswith('#') and m.group(1) not in os.environ:
                    os.environ[m.group(1)] = re.sub(r'^([\'"])(.*)\1$', r'\2', m.group(2))
    except OSError:
        pass


def decode_key(key):
    k = str(key).strip()
    if not k.startswith('nkc_'):
        raise NookError('That is not a Nook connect key (it should start with nkc_)')
    try:
        b = k[4:].replace('-', '+').replace('_', '/')
        d = json.loads(base64.b64decode(b + '=' * (-len(b) % 4)).decode('utf-8'))
        if not (d.get('u') and d.get('k') and d.get('t')):
            raise ValueError('missing fields')
        return d
    except Exception:
        raise NookError('That connect key looks damaged. Copy it again from the Developer portal.')


# ── messages: text, or a dict { content, embed, buttons, select } ──
def _embed_obj(e):
    o = {}
    if e.get('title'): o['t'] = str(e['title'])[:120]
    if e.get('url'): o['u'] = e['url']
    if e.get('description'): o['d'] = str(e['description'])[:1500]
    if e.get('color'): o['c'] = e['color']
    if e.get('image'): o['i'] = e['image']
    if e.get('thumbnail'): o['th'] = e['thumbnail']
    if e.get('footer'): o['f'] = str(e['footer'])[:80]
    if e.get('footer_icon') or e.get('footerIcon'): o['fi'] = e.get('footer_icon') or e.get('footerIcon')
    ts = e.get('timestamp')
    if ts:
        if ts is True:
            ts = datetime.now(timezone.utc)
        o['ts'] = ts.isoformat() if isinstance(ts, datetime) else str(ts)
    a = e.get('author')
    if a:
        o['a'] = {'n': str(a.get('name', ''))[:60], 'i': a.get('icon') or a.get('image') or '', 'u': a.get('url') or ''}
    if e.get('fields'):
        o['fl'] = [[str(f[0])[:40], str(f[1])[:200], 1 if len(f) > 2 and f[2] else 0] for f in e['fields'][:6]]
    return o


def encode_message(x):
    if not isinstance(x, dict):
        return str(x)
    o = _embed_obj(x['embed']) if x.get('embed') else {}
    if x.get('content'):
        o['x'] = str(x['content'])[:1000]
    if x.get('buttons'):
        bt = []
        for b in x['buttons'][:10]:
            if isinstance(b, (list, tuple)):
                bt.append(list(b))
            else:
                bt.append([b.get('id', ''), str(b.get('label', ''))[:40], b.get('style') or ('link' if b.get('url') else 'secondary'), b.get('url', ''), 1 if b.get('disabled') else 0])
        o['bt'] = bt
    if x.get('select'):
        s = x['select']
        opts = []
        for p in (s.get('options') or s.get('o') or [])[:25]:
            opts.append(list(p) if isinstance(p, (list, tuple)) else [str(p['label']), str(p.get('value', p['label'])), p.get('description', '')])
        o['sl'] = {'id': s['id'], 'ph': s.get('placeholder') or s.get('ph') or '', 'o': opts}
    if not o:
        raise NookError('Empty message')
    if list(o.keys()) == ['x']:
        return o['x']
    out = '<embed>' + json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    if len(out) > 2000:
        raise NookError('That message is too big (%d of 2000 characters). Shorten the text or drop a field.' % len(out))
    return out


def encode_poll(question, options):
    return '<poll>' + json.dumps({'q': str(question)[:200], 'o': [str(x)[:80] for x in options[:6]]}, ensure_ascii=False, separators=(',', ':'))


class NookBot:
    def __init__(self, key=None, prefix='!', interval=1.5, help=True, workers=4, url=None, anon_key=None, token=None):
        _load_env()
        key = key or os.environ.get('NOOK_KEY')
        if key:
            d = decode_key(key)
            url, anon_key, token = url or d['u'], anon_key or d['k'], token or d['t']
        if not (url and anon_key and token):
            raise NookError('NookBot needs a connect key. Put  NOOK_KEY=nkc_...  in a file called .env next to your bot (copy the key from the Developer portal).')
        self.url = url.rstrip('/')
        self.anon_key = anon_key
        self.token = token
        self.prefix = prefix
        self.interval = interval
        self.info = None
        self.running = False
        self._handlers = {}
        self._commands = {}
        self._slash = {}
        self._components = []
        self._cursor = self._icursor = None
        self._seen, self._iseen = set(), set()
        self._cool = {}
        self._legacy = False
        self._no_interactions = False
        self._pool = ThreadPoolExecutor(max_workers=workers)
        if help:
            self.command('help', description='Show this list')(lambda m, args: m.reply(self.help_text()))

    # ── decorators ──
    def on(self, event):
        """@bot.on('message')  events: message, mention, edit, reaction, member_join, interaction, ready, error"""
        def deco(fn):
            self._handlers.setdefault(event, []).append(fn)
            return fn
        return deco

    def command(self, name, description='', cooldown=0):
        """@bot.command('roll', description='Roll a die', cooldown=5)  then  def roll(m, args): ...   People type !roll"""
        def deco(fn):
            self._commands[name.lower()] = {'fn': fn, 'description': description, 'cooldown': cooldown}
            return fn
        return deco

    def slash(self, name, description='No description', options=None):
        """@bot.slash('roll', description='Roll a die', options=[{'name': 'sides', 'type': 'integer'}])  then  def roll(i): i.reply(...)
        option types: string, integer, number, boolean, user, channel. Add required=True or choices=['a', 'b']."""
        def deco(fn):
            self._slash[name.lower().lstrip('/')] = {'fn': fn, 'description': description, 'options': options or []}
            return fn
        return deco

    def button(self, match):
        """@bot.button('vote:yes')  ('vote:*' matches every id that starts with "vote:", or pass a compiled re.Pattern)"""
        def deco(fn):
            self._components.append((match, fn))
            return fn
        return deco

    select = button  # menus work the same way; the picked values are in i.values

    def register_commands(self):
        cmds = []
        for name, c in self._slash.items():
            opts = []
            for o in c['options']:
                ch = [({'name': str(x['name']), 'value': str(x['value'])} if isinstance(x, dict) else {'name': str(x), 'value': str(x)}) for x in o.get('choices', [])]
                opts.append({'name': o['name'], 'description': str(o.get('description') or o['name'])[:100], 'type': o.get('type', 'string'), 'required': bool(o.get('required')), 'choices': ch})
            cmds.append({'name': name, 'description': str(c['description'])[:100], 'options': opts})
        return self.rpc('bot_register_commands', self._t(cmds=cmds))

    def help_text(self):
        lines = ['**/%s**: %s' % (n, c['description']) for n, c in self._slash.items()]
        lines += ['**%s%s**: %s' % (self.prefix, n, c['description']) for n, c in self._commands.items() if c['description']]
        return '\n'.join(lines) or 'No commands yet.'

    # ── talking to Nook ──
    def rpc(self, name, body):
        req = urllib.request.Request(
            '%s/rest/v1/rpc/%s' % (self.url, name), data=json.dumps(body).encode('utf-8'), method='POST',
            headers={'apikey': self.anon_key, 'Authorization': 'Bearer ' + self.anon_key, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            text = e.read().decode('utf-8', 'replace')
            try:
                d = json.loads(text)
            except ValueError:
                d = {}
            raise NookError(d.get('message') or 'HTTP %d' % e.code, status=e.code, code=d.get('code'))
        except urllib.error.URLError as e:
            raise NookError('Could not reach Nook: %s' % e.reason)
        return json.loads(text) if text else None

    def _t(self, **extra):
        return dict(token=self.token, **extra)

    # ── who am I, what can I see ──
    def me(self): return self.rpc('bot_me', self._t())
    def groups(self): return self.me()['groups']

    def channel(self, name):
        """Find a channel (and its group_id) by name in any group the bot is in: bot.channel('general')"""
        want = name.lstrip('#').lower()
        for g in self.groups():
            for c in g['channels']:
                if c['name'] == want:
                    return Obj(dict(c, group_id=g['id']))
        return None

    def members(self, group_id, limit=200): return [Obj(x) for x in self.rpc('bot_members', self._t(gid=group_id, lim=limit))]
    def history(self, channel_id, before=None, limit=50): return [Obj(x) for x in self.rpc('bot_history', self._t(channel=channel_id, before_t=before, lim=limit))]
    def get_message(self, message_id): return Obj(self.rpc('bot_get_message', self._t(message=message_id)))
    def poll_results(self, message_id): return self.rpc('bot_poll_results', self._t(message=message_id))

    # ── messages: text, or a dict { 'content', 'embed', 'buttons', 'select' } ──
    def send(self, channel_id, content, reply=None): return self.rpc('bot_send', self._t(channel=channel_id, content=encode_message(content), reply=reply))
    def edit(self, message_id, content): return self.rpc('bot_edit', self._t(message=message_id, content=encode_message(content)))
    def delete(self, message_id): return self.rpc('bot_delete', self._t(message=message_id))
    def react(self, message_id, emoji): return self.rpc('bot_react', self._t(message=message_id, kind=emoji))
    def unreact(self, message_id, emoji): return self.rpc('bot_unreact', self._t(message=message_id, kind=emoji))
    def pin(self, message_id): return self.rpc('bot_pin', self._t(message=message_id, pin=True))
    def unpin(self, message_id): return self.rpc('bot_pin', self._t(message=message_id, pin=False))
    def embed(self, channel_id, e, reply=None): return self.send(channel_id, {'embed': e}, reply)
    def poll(self, channel_id, question, options, reply=None): return self.rpc('bot_send', self._t(channel=channel_id, content=encode_poll(question, options), reply=reply))

    # ── moderation: each needs the matching permission ──
    def kick(self, group_id, user_id): return self.rpc('bot_kick', self._t(gid=group_id, member=user_id))
    def timeout(self, group_id, user_id, minutes): return self.rpc('bot_timeout', self._t(gid=group_id, member=user_id, minutes=minutes))
    def create_channel(self, group_id, name, topic=''): return self.rpc('bot_create_channel', self._t(gid=group_id, cname=name, topic=topic))
    def delete_channel(self, channel_id): return self.rpc('bot_delete_channel', self._t(channel=channel_id))
    def rename_channel(self, channel_id, name): return self.rpc('bot_rename_channel', self._t(channel=channel_id, cname=name))
    def set_topic(self, channel_id, topic): return self.rpc('bot_set_topic', self._t(channel=channel_id, topic=topic))
    def update_group(self, group_id, name=None, description=None): return self.rpc('bot_group_update', self._t(gid=group_id, gname=name, descr=description))
    def invite_code(self, group_id): return self.rpc('bot_invite_code', self._t(gid=group_id))
    def purge(self, channel_id, count=10): return self.rpc('bot_purge', self._t(channel=channel_id, n=count))
    def pins(self, channel_id): return [Obj(x) for x in self.rpc('bot_pins', self._t(channel=channel_id))]
    def search(self, group_id, text, limit=20): return [Obj(x) for x in self.rpc('bot_search', self._t(gid=group_id, q=text, lim=limit))]
    def audit(self, group_id, limit=30): return [Obj(x) for x in self.rpc('bot_audit', self._t(gid=group_id, lim=limit))]
    def user(self, username): return Obj(self.rpc('bot_user', self._t(uname=username)))

    # ── the bot itself ──
    def set_status(self, kind=None, name=None): return self.rpc('bot_set_status', self._t(kind=kind, name=name))
    def leave(self, group_id): return self.rpc('bot_leave', self._t(gid=group_id))
    def sleep(self, seconds): time.sleep(seconds)

    # ── the loop ──
    def run(self):
        """Run the bot until you press Ctrl+C."""
        try:
            self.start()
        except KeyboardInterrupt:
            print('Stopped.')

    def stop(self):
        self.running = False

    def _emit(self, event, *args):
        for fn in self._handlers.get(event, []):
            self._pool.submit(self._safe, fn, *args)

    def _safe(self, fn, *args):
        try:
            fn(*args)
        except Exception as e:  # one failing handler never stops the bot
            if fn.__name__ == '_on_error' or not self._handlers.get('error'):
                print('Problem:', e, file=sys.stderr)
                traceback.print_exc()
            else:
                for h in self._handlers['error']:
                    try: h(e)
                    except Exception: pass

    def start(self):
        self.running = True
        self.info = Obj(self.me())  # raises "Invalid bot token" if the key is wrong
        self._cursor = self._icursor = self.info['now']
        if self._slash:
            try:
                self.register_commands()
            except NookError as e:
                self._emit_error(NookError('Could not publish the slash commands: %s (has update_v27.sql been run?)' % e))
        self._emit('ready', self.info)
        if not self._handlers.get('ready'):
            print('Online as %s in %d group(s). Press Ctrl+C to stop.' % (self.info.get('name'), len(self.info.get('groups', []))))
        wait = self.interval
        while self.running:
            try:
                events = self._poll()
                for ev in events:
                    if _t(ev['at']) > _t(self._cursor):
                        self._cursor = ev['at']
                    self._dispatch(self._decorate(ev))
                clicks = self._poll_interactions()
                for it in clicks:
                    if _t(it['at']) > _t(self._icursor):
                        self._icursor = it['at']
                    self._interaction(self._decorate_interaction(it))
                wait = 0 if len(events) >= 100 or len(clicks) >= 100 else self.interval
            except NookError as e:
                self._emit_error(e)
                wait = min((wait or self.interval) * 2, 30)  # be gentle while something is wrong
            if wait:
                time.sleep(wait)

    def _emit_error(self, e):
        if self._handlers.get('error'):
            self._emit('error', e)
        else:
            print('Problem:', e, file=sys.stderr)

    def _poll(self):
        if not self._legacy:
            try:
                after = (_t(self._cursor) - timedelta(seconds=1)).isoformat()
                rows = self.rpc('bot_events2', self._t(after=after, lim=100))
                out = []
                for r in rows:
                    key = '%s:%s:%s:%s:%s' % (r['type'], r.get('message_id') or r.get('user_id'), r['at'], r.get('kind') or '', r.get('user_id'))
                    if key in self._seen:
                        continue
                    self._seen.add(key)
                    if len(self._seen) > 3000:
                        self._seen.pop()
                    out.append(r)
                return out
            except NookError as e:
                if e.code != 'PGRST202' and 'bot_events2' not in str(e):
                    raise
                self._legacy = True  # the database has not had update_v25.sql yet: messages only
        rows = self.rpc('bot_events', self._t(after=self._cursor, lim=100))
        return [dict(type='message', at=m['created_at'], group_id=m['group_id'], group_name=m['group_name'], channel_id=m['channel_id'], channel_name=m['channel_name'],
                     message_id=m['id'], user_id=m['author_id'], username=m['author_username'], display_name=m['author_name'], is_bot=m.get('author_is_bot'),
                     content=m['content'], reply_to=m.get('reply_to'), kind=None, mentioned=m.get('mentioned')) for m in rows]

    def _poll_interactions(self):
        if self._no_interactions:
            return []
        try:
            after = (_t(self._icursor) - timedelta(seconds=1)).isoformat()
            rows = self.rpc('bot_interactions', self._t(after=after, lim=100))
        except NookError as e:
            if e.code == 'PGRST202' or 'bot_interactions' in str(e):
                self._no_interactions = True  # update_v27.sql not run yet
                return []
            raise
        out = []
        for r in rows:
            if r['id'] in self._iseen:
                continue
            self._iseen.add(r['id'])
            if len(self._iseen) > 3000:
                self._iseen.pop()
            out.append(r)
        return out

    def _decorate(self, ev):
        m = Obj(ev)
        dict.update(m, id=ev.get('message_id'), author_id=ev.get('user_id'), author_username=ev.get('username'), author_name=ev.get('display_name'), author_is_bot=ev.get('is_bot'), created_at=ev.get('at'))
        m['reply'] = lambda text: self.send(ev['channel_id'], text, reply=ev['message_id'])
        m['say'] = lambda text: self.send(ev['channel_id'], text)
        m['react'] = lambda emoji: self.react(ev['message_id'], emoji)
        m['delete'] = lambda: self.delete(ev['message_id'])
        return m

    def _dispatch(self, m):
        t = m.get('type')
        if t == 'edit': return self._emit('edit', m)
        if t == 'reaction': return self._emit('reaction', m)
        if t == 'member_join': return self._emit('member_join', m)
        self._emit('message', m)
        if m.get('mentioned'):
            self._emit('mention', m)
        content = m.get('content') or ''
        if content.startswith(self.prefix):
            parts = content[len(self.prefix):].strip().split()
            cmd = self._commands.get(parts[0].lower()) if parts else None
            if not cmd:
                return
            if cmd['cooldown']:
                k = '%s:%s' % (parts[0], m['user_id'])
                if time.time() < self._cool.get(k, 0):
                    return
                self._cool[k] = time.time() + cmd['cooldown']
            self._pool.submit(self._safe, cmd['fn'], m, parts[1:])

    def _decorate_interaction(self, r):
        i = Obj(r)
        i['options'] = Obj(r.get('options') or {})
        i['values'] = r.get('picked') or []
        i['value'] = i['values'][0] if i['values'] else None

        def answer(x, hidden=None, mode='reply'):
            if hidden is None:
                hidden = isinstance(x, dict) and bool(x.get('hidden') or x.get('ephemeral'))
            return self.rpc('bot_respond', self._t(interaction=r['id'], content=encode_message(x), hidden=bool(hidden), mode=mode))
        i['reply'] = lambda x, hidden=False: answer(x, hidden)       # a message everyone sees (hidden=True: only the person who clicked)
        i['hidden'] = lambda x: answer(x, True)                      # a message only that person sees
        i['update'] = lambda x: answer(x, False, 'update')           # change the message the button was on
        i['say'] = lambda x: self.send(r['channel_id'], x)
        return i

    def _interaction(self, i):
        self._emit('interaction', i)
        fn = None
        if i['kind'] == 'command':
            c = self._slash.get(i['name'])
            fn = c['fn'] if c else None
        else:
            for match, f in self._components:
                if (hasattr(match, 'search') and match.search(i['name'])) or (isinstance(match, str) and (match.endswith('*') and i['name'].startswith(match[:-1]) or match == i['name'])):
                    fn = f
                    break
        if not fn:
            if i['kind'] == 'command':
                self._pool.submit(self._safe, lambda: i.hidden('Sorry, I do not know that command.'))
            return

        def go():
            try:
                fn(i)
            except Exception as e:
                self._emit_error(e)
                traceback.print_exc()
                try: i.hidden('Something went wrong running that.')
                except Exception: pass
        self._pool.submit(go)


def _t(iso):
    s = str(iso).replace('Z', '+00:00')
    m = re.match(r'^(.*?)(\.\d+)?([+-]\d\d:?\d\d)?$', s)
    base, frac, tz = m.group(1), (m.group(2) or '')[:7], m.group(3) or '+00:00'
    return datetime.fromisoformat(base + frac + (tz if ':' in tz else tz[:3] + ':' + tz[3:]))
