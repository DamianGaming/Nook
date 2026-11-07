// Shared by the Developer portal and the documentation: the library reference, permissions, project files and the AI prompt.
import { TEMPLATES } from './botTemplates.js'
export { TEMPLATES }
export const PERMS = [
  ['messages', 'Delete other people\'s messages, pin and unpin, purge a channel.'],
  ['members', 'Remove members, time them out, read the audit log.'],
  ['channels', 'Create, rename and delete channels, change topics.'],
  ['customize', 'Change the group\'s name and description.'],
  ['invites', 'Read the group\'s invite code.'],
  ['emoji', 'Reserved for managing emoji and stickers.'],
]
export const PRESETS = [
  ['chat', 'Chat only', [], 'Reads and talks. Good for games, jokes, answers and AI chat bots.'],
  ['mod', 'Moderator', ['messages', 'members'], 'Also deletes messages, kicks and times people out.'],
  ['full', 'Full control', ['messages', 'members', 'channels', 'customize', 'invites', 'emoji'], 'Can change almost everything in a group.'],
]

export const LIB = [
  ['Slash commands, buttons and hidden messages', [
    ['bot.slash(name, { description, options }, (i) => ...)', 'A command people pick after typing "/". Options: { name, description, type, required, choices } with type string, integer, number, boolean, user or channel. Published automatically when the bot starts.'],
    ['i.options', 'What the person filled in, for example i.options.sides. Numbers are numbers, user and channel options are usernames and channel names.'],
    ['i.reply(content, { hidden })', 'Answer with a message everyone sees, or { hidden: true } so only that person sees it. content can be text or { content, embed, buttons, select }.'],
    ['i.hidden(content)', 'Answer with a message only that person can see ("Only you can see this").'],
    ['i.update(content)', 'On a button or menu: change the message it was on (text, embed and buttons).'],
    ['i.user_id, i.username, i.group_id, i.channel_id, i.group_name, i.channel_name', 'Who ran it and where.'],
    ['bot.button(id, (i) => ...)', 'Run code when a button is pressed. id can end in * to match many ("vote:*"), or be a RegExp.'],
    ['bot.select(id, (i) => ...)', 'Run code when someone picks from a dropdown. The choice is in i.value (or i.values).'],
    ['bot.registerCommands()', 'Publish the slash commands now (start() already does).'],
  ]],
  ['Setup', [
    ['new NookBot({ prefix = "!", interval = 1500 })', 'Make a bot. It reads your connect key from NOOK_KEY (the .env file in your bot folder). The prefix is for ! commands, the interval is how often it checks for news (milliseconds).'],
    ['bot.start() / bot.stop()', 'Start or stop listening. start() checks the token first and fails clearly if it is wrong.'],
    ['bot.on(event, fn)', 'Listen for message, mention, edit, reaction, memberJoin, ready or error.'],
    ['bot.command(name, fn, { description, cooldown })', 'Run fn(m, args, text) when someone writes the prefix and name. Cooldown is seconds per person. Commands with a description appear in !help.'],
  ]],
  ['Reading', [
    ['bot.me() / bot.groups()', 'The bot\'s groups with channels, member counts and the permissions it has been given.'],
    ['bot.channel("general")', 'Find a channel (and its group) by name.'],
    ['bot.members(groupId)', 'Everyone in a group.'],
    ['bot.history(channelId, { before, limit })', 'Recent messages, newest first.'],
    ['bot.getMessage(id)', 'One message with its reaction counts.'],
    ['bot.pollResults(id)', 'The votes on a poll.'],
  ]],
  ['Messages', [
    ['m.reply(text) / m.say(text)', 'Shortcuts on every message event: reply to it or just post in the same channel.'],
    ['m.react(emoji) / m.delete()', 'React to it or delete it.'],
    ['bot.send(channelId, text, { reply })', 'Post a message.'],
    ['bot.send(channelId, { content, embed, buttons, select })', 'Post a message with a card, buttons or a dropdown. Plain text works too.'],
    ['embed: { author: { name, icon, url }, title, url, description, color, fields: [[name, value, inline]], image, thumbnail, footer, footerIcon, timestamp }', 'Everything an embed card can show (up to 6 fields).'],
    ['buttons: [{ id, label, style, url, disabled }]', 'Up to 10 buttons. style is primary, secondary, success or danger. Give url instead of id for a link button.'],
    ['select: { id, placeholder, options: [{ label, value, description }] }', 'A dropdown menu with up to 25 options.'],
    ['bot.embed(channelId, { ...embed })', 'Shortcut to post just an embed card.'],
    ['bot.poll(channelId, question, [options])', 'Post a poll (2 to 6 options).'],
    ['bot.edit(id, text) / bot.delete(id)', 'Change or remove a message.'],
    ['bot.react(id, emoji) / bot.unreact(id, emoji)', 'Add or remove a reaction.'],
    ['bot.pin(id) / bot.unpin(id)', 'Pin or unpin (needs messages).'],
    ['bot.pins(channelId)', 'The pinned messages of a channel.'],
    ['bot.search(groupId, text, limit)', 'Search a group\'s messages.'],
    ['bot.purge(channelId, count)', 'Delete the latest messages of a channel, up to 100 (needs messages).'],
  ]],
  ['Moderation', [
    ['bot.kick(groupId, userId)', 'Remove someone (needs members).'],
    ['bot.timeout(groupId, userId, minutes)', 'Time someone out, 0 to end it (needs members).'],
    ['bot.createChannel(groupId, name, topic)', 'Needs channels.'],
    ['bot.deleteChannel(channelId)', 'Needs channels.'],
    ['bot.renameChannel(channelId, name) / bot.setTopic(channelId, topic)', 'Needs channels.'],
    ['bot.updateGroup(groupId, { name, description })', 'Needs customize.'],
    ['bot.inviteCode(groupId)', 'Needs invites.'],
    ['bot.audit(groupId, limit)', 'The audit log (needs members).'],
    ['bot.user(username)', 'Someone\'s profile and roles, if they share a group with the bot.'],
  ]],
  ['The bot itself', [
    ['bot.setStatus(kind, text)', 'playing, listening, watching, streaming, competing or building. bot.setStatus() clears it.'],
    ['bot.leave(groupId)', 'Leave a group.'],
  ]],
]


// ── the connect key: one string holding the site address, the public key and the bot's token ──
export const SITE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SITE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const b64url = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const makeConnectKey = (token) => 'nkc_' + b64url(JSON.stringify({ u: SITE_URL, k: SITE_KEY, t: token }))

const libText = () => LIB.map(([g, rows]) => `## ${g}\n` + rows.map(([sig, d]) => `- ${sig}: ${d}`).join('\n')).join('\n\n')

// The Python version of the library, in the same words (shown in the docs and given to AIs).
export const PY_REF = `from nook_bot import NookBot
bot = NookBot()                      # reads NOOK_KEY from .env; bot.run() at the end of the file starts it

@bot.slash('roll', description='Roll a die', options=[{'name': 'sides', 'description': 'How many sides', 'type': 'integer', 'required': False}])
def roll(i):                         # i = the interaction
    i.reply('You rolled %d' % random.randint(1, i.options.sides or 6))      # i.reply(x, hidden=True) / i.hidden(x) / i.update(x) / i.say(x)
    # i.options.<name>, i.value / i.values (dropdown), i.user_id, i.username, i.group_id, i.channel_id, i.group_name, i.channel_name
    # option types: string, integer, number, boolean, user, channel; add 'required': True or 'choices': ['a', 'b']

@bot.button('vote:*')                # also @bot.select('menu-id'); 'vote:*' matches every id starting with "vote:"
def vote(i): i.update({'content': 'Thanks!'})

@bot.command('ping', description='Check I am awake', cooldown=5)     # old-style !ping
def ping(m, args): m.reply('pong')   # m.reply(text) m.say(text) m.react(emoji) m.delete() m.content m.username m.channel_id m.group_id m.user_id m.is_bot

@bot.on('message')                   # events: message, mention, edit, reaction, member_join, ready, error
def on_message(m): ...

Methods (snake_case, same names as the Node version): bot.me() bot.groups() bot.channel('general') bot.members(group_id) bot.history(channel_id, before=None, limit=50)
bot.get_message(id) bot.poll_results(id) bot.send(channel_id, text_or_dict, reply=None) bot.edit(id, text_or_dict) bot.delete(id) bot.react(id, emoji) bot.unreact(id, emoji)
bot.pin(id) bot.unpin(id) bot.pins(channel_id) bot.search(group_id, text, limit=20) bot.purge(channel_id, count=10) bot.embed(channel_id, {...}) bot.poll(channel_id, question, [options])
bot.kick(group_id, user_id) bot.timeout(group_id, user_id, minutes) bot.create_channel(group_id, name, topic='') bot.delete_channel(id) bot.rename_channel(id, name) bot.set_topic(id, topic)
bot.update_group(group_id, name=None, description=None) bot.invite_code(group_id) bot.audit(group_id, limit=30) bot.user(username) bot.set_status('playing', 'Chess') bot.leave(group_id)
Rich message dict: {'content': 'text', 'embed': {'author': {'name': ...}, 'title': ..., 'url': ..., 'description': ..., 'color': '#6475f5', 'fields': [['Name', 'Value', True]], 'image': ..., 'thumbnail': ..., 'footer': ..., 'footer_icon': ..., 'timestamp': True},
 'buttons': [{'id': 'yes', 'label': 'Yes', 'style': 'success'}, {'label': 'Docs', 'url': 'https://...'}], 'select': {'id': 'menu', 'placeholder': 'Pick', 'options': [{'label': 'A', 'value': 'a', 'description': '...'}]}}
bot.run() starts the bot (put it on the last line).`

const DB_NOTE = `Nook does NOT store anything for a bot between restarts. If the bot must remember things (scores, settings, who said what), give it its own database: SQLite (a file next to the bot; Node: the better-sqlite3 package, Python: the built-in sqlite3 module) or MySQL (Node: mysql2, Python: mysql-connector-python or pymysql). Keep database passwords in the .env file, read with process.env (Node) or os.environ (Python).`

// A brief to paste into ChatGPT, Claude, Gemini or any AI so it can write a working Nook bot.
export function aiPrompt(wish = '', lang = 'js') {
  const py = lang === 'py'
  const rules = `- Write ONE file${py ? ' (mybot.py)' : ' (mybot.mjs)'}. A variable called bot already exists (a NookBot). Do NOT create it, do NOT import the Nook library and do NOT call ${py ? 'bot.run()' : 'bot.start()'}: the header and the start line are added for me afterwards. Write only the code that uses bot, including any other imports it needs.
- Prefer slash commands, buttons, dropdowns and hidden replies (i.hidden) over ! commands.
- Messages are markdown and at most 2000 characters, so split long text. An embed plus buttons must stay under 2000 characters in total. People cannot see raw errors, so catch problems and reply politely.
- Moderation only works if the bot owner gave the bot that permission (messages, members, channels, customize, invites). If something fails with "needs the ... permission", tell me to grant it in Group settings, Members.
- ${DB_NOTE}
- If the bot calls an outside service that needs a secret (like an OpenAI or Gemini key), read it from ${py ? 'os.environ' : 'process.env'} (for example OPENAI_API_KEY), never write the secret into the code, and tell me to add it to the .env file.
- Keep the code simple, with short comments.`
  const ref = py ? PY_REF : `Slash commands (preferred): bot.slash('name', { description: 'What it does', options: [{ name: 'amount', description: '...', type: 'integer', required: true }] }, async (i) => { ... })
  Option types: string, integer, number, boolean, user, channel. Add choices: ['a', 'b'] for a fixed list. Names are lowercase letters, numbers, - and _.
  i.options.amount holds the answer. Reply with i.reply('text'), i.reply('text', { hidden: true }) or i.hidden('text') so only that person sees it. i.username, i.user_id, i.group_id, i.channel_id, i.group_name, i.channel_name say who and where.
Buttons and dropdowns: bot.button('id', (i) => ...) and bot.select('id', (i) => ...). Inside, i.update({...}) changes the message that held the button, i.reply(...) and i.hidden(...) answer, i.value is the dropdown choice. ids can end in * ("vote:*").
Old-style commands people type with ! : bot.command('name', async (m, args, text) => {...}, { description, cooldown }). m.reply(text), m.say(text), m.react(emoji), m.delete(), m.content, m.username, m.channel_id, m.group_id, m.user_id, m.is_bot.
Events: bot.on('message' | 'mention' | 'edit' | 'reaction' | 'memberJoin' | 'ready' | 'error', fn).
Rich messages: bot.send(channelId, { content: 'text', embed: { title, description, color: '#6475f5', author: { name }, fields: [['Name', 'Value', true]], image, thumbnail, footer, footerIcon, timestamp: true }, buttons: [{ id: 'yes', label: 'Yes', style: 'success' }, { label: 'Docs', url: 'https://...' }], select: { id: 'menu', placeholder: 'Pick', options: [{ label: 'A', value: 'a' }] } })
Polls: bot.poll(channelId, 'Question?', ['A', 'B', 'C']).

Every method (returns a promise, use await):
${libText()}`
  return `You are helping me make a chat bot for Nook, a Discord-style chat app. Write it in ${py ? 'Python 3.8 or newer' : 'JavaScript (Node.js 18 or newer, ES modules)'}.

Rules:
${rules}

What you can use:
${ref}

After the code, list in one line any extra packages it needs (${py ? 'pip install ...' : 'npm install ...'}) and in one line which permissions the bot needs, if any.

What I want my bot to do:
${wish.trim() || '(describe your bot here, for example: "a /ask command that answers with ChatGPT", or "welcome new members with a card and a Rules button")'}
`
}

// ── where the libraries are downloaded from: the website you are on (or VITE_SITE_URL for the desktop app) ──
export const siteBase = () => (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')) || 'https://YOUR-SITE'
export const PY_VERSION = '4.0.0'
export const NODE_LIB_URL = () => `${siteBase()}/sdk/nook-bot.tgz`
export const PY_LIB_URL = () => `${siteBase()}/sdk/nook_bot-${PY_VERSION}-py3-none-any.whl`

const PIP_NAMES = { mysql: 'mysql-connector-python', yaml: 'pyyaml', PIL: 'pillow', bs4: 'beautifulsoup4', dotenv: 'python-dotenv', cv2: 'opencv-python', sklearn: 'scikit-learn' }
const PY_STDLIB = new Set('abc argparse array ast asyncio base64 bisect calendar collections concurrent contextlib copy csv dataclasses datetime decimal difflib enum fnmatch fractions functools glob gzip hashlib heapq hmac html http importlib inspect io itertools json logging math mimetypes operator os pathlib pickle platform queue random re secrets shlex shutil signal socket sqlite3 ssl statistics string struct subprocess sys tempfile textwrap threading time traceback types typing unicodedata urllib uuid warnings weakref zipfile zoneinfo nook_bot'.split(' '))
const NODE_BUILTIN = new Set('assert buffer child_process crypto dns events fs http https net os path process readline stream string_decoder timers tls url util zlib worker_threads'.split(' '))

// Packages a bot's code needs besides the Nook library.
export function findDeps(code, lang) {
  const out = new Set()
  if (lang === 'py') {
    for (const m of String(code).matchAll(/^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) if (!PY_STDLIB.has(m[1])) out.add(PIP_NAMES[m[1]] || m[1])
  } else {
    for (const m of String(code).matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"./][^'"]*)['"]/g)) {
      const n = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]
      if (!n.startsWith('node:') && !NODE_BUILTIN.has(n) && n !== 'nook-bot') out.add(n)
    }
  }
  return [...out]
}

// Tidy code that comes from somewhere else (for example an AI): drop code fences, and the lines that make the bot or start it, because the header and footer do that.
export function cleanCode(code, lang) {
  let body = String(code || '').replace(/^```[A-Za-z]*[ \t]*\n?/gm, '').replace(/^```[ \t]*$/gm, '')
  if (lang === 'py') {
    body = body.replace(/^\s*(?:from\s+nook_bot\s+import\s+[^\n]*|import\s+nook_bot[^\n]*)\n?/gm, '').replace(/^\s*bot\s*=\s*NookBot\([^\n]*\)[ \t]*\n?/m, '').replace(/^\s*bot\.(?:run|start)\(\)[ \t]*$/gm, '')
  } else {
    body = body.replace(/^\s*import\s+[^\n]*['"]nook-bot['"][^\n]*\n?/gim, '').replace(/^\s*(?:const|let|var)\s+bot\s*=\s*new\s+NookBot\((?:[^()]|\([^()]*\))*\)[ \t]*;?[ \t]*\n?/m, '').replace(/^\s*bot\.start\(\)[ \t]*;?[ \t]*$/gm, '')
  }
  return body.trim()
}

export const START_BAT_NODE = () => `@echo off
title Nook bot
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start https://nodejs.org
  pause
  exit /b
)
echo Getting the newest Nook library and your packages...
call npm install --no-package-lock --no-audit --no-fund --prefer-online --silent
if errorlevel 1 (
  echo Could not install the packages. Check your internet connection.
  pause
  exit /b
)
:again
node mybot.mjs
echo.
echo The bot stopped. Restarting in 5 seconds. Close this window to stop it for good.
timeout /t 5 >nul
goto again
`
export const START_BAT_PY = () => `@echo off
title Nook bot
cd /d "%~dp0"
set PY=py
where py >nul 2>nul
if errorlevel 1 set PY=python
where %PY% >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Opening the download page...
  start https://www.python.org/downloads/
  pause
  exit /b
)
echo Getting the newest Nook library and your packages...
%PY% -m pip install --quiet --upgrade --force-reinstall --no-deps "${PY_LIB_URL()}"
%PY% -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  echo Could not install the packages. Check your internet connection.
  pause
  exit /b
)
:again
%PY% mybot.py
echo.
echo The bot stopped. Restarting in 5 seconds. Close this window to stop it for good.
timeout /t 5 >nul
goto again
`

// The whole bot folder as { filename: text }: the bot's file, the key file, how to install and start it.
export function buildProject({ lang = 'js', code, key, template }) {
  const py = lang === 'py'
  const t = TEMPLATES.find((x) => x[0] === template)
  const body = cleanCode(code ?? (t ? (py ? t[4] : t[3]) : ''), lang)
  const deps = findDeps(body, lang)
  const env = [`# Keep this file private. It holds your bot's key.`, `NOOK_KEY=${key || 'PASTE-YOUR-CONNECT-KEY-HERE'}`]
  if (/OPENAI_API_KEY/.test(body)) env.push('', '# From platform.openai.com (the AI chat bot needs it)', 'OPENAI_API_KEY=')
  if (/MYSQL|mysql/i.test(body) && /environ|process\.env/.test(body)) env.push('', '# Your MySQL details', 'MYSQL_HOST=localhost', 'MYSQL_USER=', 'MYSQL_PASSWORD=', 'MYSQL_DATABASE=')
  const files = {}
  if (py) {
    files['mybot.py'] = `# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py\nfrom nook_bot import NookBot\n\nbot = NookBot()   # reads NOOK_KEY from the .env file\n\n${body}\n\nbot.run()\n`
    files['requirements.txt'] = ['# Extra packages your bot uses. The Nook library itself is installed by start.bat.', ...deps].join('\n') + '\n'
    files['start.bat'] = START_BAT_PY()
  } else {
    files['mybot.mjs'] = `// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs\nimport { NookBot } from 'nook-bot'\n\nconst bot = new NookBot()   // reads NOOK_KEY from the .env file\n\n${body}\n\nbot.start()\n`
    const dependencies = { 'nook-bot': NODE_LIB_URL() }
    for (const d of deps) dependencies[d] = d === 'better-sqlite3' ? '^11.0.0' : '*'
    files['package.json'] = JSON.stringify({ name: 'my-nook-bot', version: '1.0.0', private: true, type: 'module', main: 'mybot.mjs', scripts: { start: 'node mybot.mjs' }, dependencies }, null, 2) + '\n'
    files['start.bat'] = START_BAT_NODE()
  }
  files['.env'] = env.join('\n') + '\n'
  files['README.txt'] = py
    ? `Your Nook bot (Python)\n\n1. Install Python 3.8+ from python.org (tick "Add python to PATH").\n2. ${key ? 'Your key is already in .env.' : 'Open .env in Notepad and paste your connect key after NOOK_KEY=.'}\n3. Double-click start.bat. It installs what the bot needs, runs it, and starts it again if it stops.\n\nOr by hand:  pip install ${PY_LIB_URL()}  then  python mybot.py\n\nThe bot forgets everything when it stops unless you store it yourself (SQLite or MySQL). See the docs on the Nook Developer page.\nKeep .env private: do not upload or share it.\n`
    : `Your Nook bot (Node.js)\n\n1. Install Node.js 18+ from nodejs.org.\n2. ${key ? 'Your key is already in .env.' : 'Open .env in Notepad and paste your connect key after NOOK_KEY=.'}\n3. Double-click start.bat. It installs what the bot needs, runs it, and starts it again if it stops.\n\nOr by hand:  npm install  then  node mybot.mjs\n\nThe bot forgets everything when it stops unless you store it yourself (SQLite or MySQL). See the docs on the Nook Developer page.\nKeep .env private: do not upload or share it.\n`
  return files
}

export function download(name, data, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }))
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
