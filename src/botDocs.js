// Shared by the Developer portal and the documentation: the bot library reference, permissions, starter bots and the AI prompt.
// ── the raw API, described once and shown as cards ──
export const API = [
  ['Who am I', [
    ['bot_me', 'token', 'The bot, its groups, channels and permissions. Also the server time to start polling from.', ''],
    ['bot_members', 'token, gid, lim?', 'Members of a group: id, username, name, is_bot, role, joined_at, timeout_until.', ''],
    ['bot_history', 'token, channel, before_t?, lim?', 'Recent messages of a channel, newest first (up to 100), with a pinned flag.', ''],
    ['bot_get_message', 'token, message', 'One message with its reaction counts.', ''],
    ['bot_poll_results', 'token, message', 'Vote counts for a poll message: option number and votes.', ''],
  ]],
  ['Events', [
    ['bot_events2', 'token, after, lim?', 'Everything that happened since "after": message, edit, reaction, member_join. Call it again with the newest "at" you saw.', ''],
    ['bot_events', 'token, after, lim?', 'The older feed with messages only. Still works.', ''],
  ]],
  ['Messages', [
    ['bot_send', 'token, channel, content, reply?', 'Post a message (1 to 2000 characters). Returns its id.', ''],
    ['bot_edit', 'token, message, content', 'Edit one of the bot\'s own messages.', ''],
    ['bot_delete', 'token, message', 'Delete a message. The bot\'s own always; other people\'s need messages.', 'messages'],
    ['bot_react', 'token, message, kind', 'Add a reaction (any emoji).', ''],
    ['bot_unreact', 'token, message, kind', 'Remove the bot\'s reaction.', ''],
    ['bot_pin', 'token, message, pin?', 'Pin or unpin a message (pin defaults to true).', 'messages'],
    ['bot_pins', 'token, channel', 'The pinned messages of a channel.', ''],
    ['bot_search', 'token, gid, q, lim?', 'Search a group\'s messages for some text (at least two letters, up to 50 results).', ''],
    ['bot_purge', 'token, channel, n?', 'Delete the latest n messages of a channel (1 to 100). Returns how many were removed.', 'messages'],
  ]],
  ['Moderation', [
    ['bot_kick', 'token, gid, member', 'Remove a member. The founder and bots with equal power cannot be removed.', 'members'],
    ['bot_timeout', 'token, gid, member, minutes', 'Stop someone posting for up to 28 days. 0 ends a timeout.', 'members'],
    ['bot_create_channel', 'token, gid, cname, topic?', 'Make a channel (lowercase letters, numbers, dashes). Returns its id.', 'channels'],
    ['bot_delete_channel', 'token, channel', 'Delete a channel (a group keeps at least one).', 'channels'],
    ['bot_rename_channel', 'token, channel, cname', 'Rename a channel.', 'channels'],
    ['bot_set_topic', 'token, channel, topic', 'Change a channel\'s topic (up to 120 characters).', 'channels'],
    ['bot_group_update', 'token, gid, gname?, descr?', 'Change the group\'s name (1 to 40 characters) and/or description (up to 200).', 'customize'],
    ['bot_invite_code', 'token, gid', 'The group\'s invite code, so the bot can hand out invites.', 'invites'],
    ['bot_audit', 'token, gid, lim?', 'The group\'s audit log: what moderators and bots did, newest first.', 'members'],
    ['bot_user', 'token, uname', 'Look someone up by username: name, bio and their role in groups the bot shares with them.', ''],
  ]],
  ['The bot itself', [
    ['bot_set_status', 'token, kind?, name?', 'Show "Playing ...", "Watching ..." and so on. Leave both empty to clear.', ''],
    ['bot_leave', 'token, gid', 'Leave a group.', ''],
    ['bot_kv_set', 'token, key, value', 'Save a JSON value (under 8000 characters, up to 500 keys).', ''],
    ['bot_kv_get', 'token, key', 'Read a saved value (null if missing).', ''],
    ['bot_kv_delete', 'token, key', 'Delete a saved value.', ''],
    ['bot_kv_list', 'token, prefix?', 'List saved values whose key starts with the prefix.', ''],
  ]],
]

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
  ['Setup', [
    ['new NookBot({ key, prefix = "!", interval = 1500 })', 'Make a bot from the connect key in the Developer portal. The prefix is for commands, the interval is how often it checks for news (milliseconds). The key can also come from the NOOK_KEY environment variable.'],
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
    ['bot.embed(channelId, { title, description, color, image, thumbnail, footer, url, fields })', 'Post a rich card.'],
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
    ['bot.kv.get / set / delete / list', 'Built-in storage. See "Storing data".'],
    ['bot.leave(groupId)', 'Leave a group.'],
    ['bot.rpc(name, body)', 'Call any function from the raw API.'],
  ]],
]


// ── the connect key: one string holding the site address, the public key and the bot's token ──
export const SITE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SITE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const b64url = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const makeConnectKey = (token) => 'nkc_' + b64url(JSON.stringify({ u: SITE_URL, k: SITE_KEY, t: token }))

const libText = () => LIB.map(([g, rows]) => `## ${g}\n` + rows.map(([s, d]) => `- ${s}: ${d}`).join('\n')).join('\n\n')

// A brief to paste into ChatGPT, Claude, Gemini or any AI so it can write a working Nook bot.
export function aiPrompt(wish = '') {
  return `You are helping me make a chat bot for Nook, a Discord-style chat app. Write ONE complete JavaScript file called bot.mjs that I can run with Node.js 18 or newer (no npm install, no other dependencies).

How it works:
- The file uses a tiny library called nook-bot.mjs that sits in the same folder. Start the file with:
    import { NookBot } from './nook-bot.mjs'
    const bot = new NookBot({ key: process.env.NOOK_KEY || 'PASTE-YOUR-CONNECT-KEY' })
- Register commands with bot.command(name, async (m, args, text) => {...}, { description, cooldown }). People type them with the ! prefix, for example !joke.
- m is the message: m.reply(text), m.say(text), m.react(emoji), m.delete(), m.content, m.username, m.channel_id, m.group_id, m.user_id.
- Events: bot.on('message' | 'mention' | 'edit' | 'reaction' | 'memberJoin' | 'ready' | 'error', fn).
- End the file with: bot.start()
- Messages are markdown. Messages are at most 2000 characters, so split long text.
- The bot can only do moderation things when its owner has given it the permission (messages, members, channels, customize, invites). If an action fails with "needs the ... permission", tell the user to grant it in Group settings, Members.
- If the bot calls an outside service that needs a secret (like an OpenAI or Gemini API key), read it from process.env (for example process.env.OPENAI_API_KEY) and never write the secret into the code. Use Node's built-in fetch.
- For an AI chat bot: when mentioned (bot.on('mention', ...)) or when someone uses a command like !ask, call the AI service, then m.reply() the answer. Keep short per-channel memory with bot.kv or a plain Map, and trim answers to under 1900 characters.
- Keep the code simple, add short comments, handle errors with try/catch so one failure never stops the bot.

The library (every method returns a promise):
${libText()}

Rich messages:
- bot.embed(channelId, { title, description, color: '#6475f5', thumbnail, image, footer, url, fields: [['Name', 'Value']] })  // up to 4 fields
- bot.poll(channelId, 'Question?', ['A', 'B', 'C'])  // 2 to 6 options
- Storage: await bot.kv.set('key', anyJson); await bot.kv.get('key'); bot.kv.list('prefix:'); bot.kv.delete('key')

After the code, tell me in two short sentences how to run it on Windows (set NOOK_KEY, then node bot.mjs) and which permissions the bot needs, if any.

What I want my bot to do:
${wish.trim() || '(describe your bot here, for example: "a bot that answers questions with ChatGPT when someone types !ask", or "welcomes new members and posts the rules")'}
`
}

// ── starter bots: each is the body that goes between "make the bot" and "bot.start()" ──
export const TEMPLATES = [
  ['hello', 'Hello bot', 'Says hello, rolls dice, flips coins, runs polls.', `bot.on('ready', async (me) => {
  console.log('Online as', me.name)
  await bot.setStatus('playing', 'with !help')
})
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check that I am awake' })
bot.command('roll', (m, args) => {
  const sides = Math.min(Math.max(parseInt(args[0], 10) || 6, 2), 1000)
  return m.reply('🎲 You rolled **' + (1 + Math.floor(Math.random() * sides)) + '** (d' + sides + ')')
}, { description: 'Roll a die: !roll or !roll 20', cooldown: 2 })
bot.command('flip', (m) => m.reply(Math.random() < 0.5 ? 'Heads' : 'Tails'), { description: 'Flip a coin' })
bot.command('vote', (m, args, text) => {
  const [q, ...opts] = text.split('|').map((s) => s.trim()).filter(Boolean)
  if (!q || opts.length < 2) return m.reply('Use it like this: !vote Pizza night? | Yes | No')
  return bot.poll(m.channel_id, q, opts)
}, { description: 'Start a poll: !vote Question | A | B' })`],
  ['welcome', 'Welcome and rules', 'Greets new members and answers !rules.', `const WELCOME_CHANNEL = 'general'   // the channel to greet people in
const RULES = ['Be kind.', 'No spam.', 'Keep it on topic.']   // edit me

bot.on('memberJoin', async (e) => {
  const ch = await bot.channel(WELCOME_CHANNEL)
  if (ch) await bot.send(ch.id, 'Welcome, @' + e.username + '! Type **!rules** to see the rules.')
})
bot.command('rules', (m) => m.reply('**Rules**\\n' + RULES.map((r, i) => (i + 1) + '. ' + r).join('\\n')), { description: 'Show the rules' })`],
  ['mod', 'Moderator', 'Word filter, !kick, !timeout, !purge, !pin. Needs the Moderator permissions.', `const BAD_WORDS = ['badword1', 'badword2']   // edit me
const find = async (groupId, name) => (await bot.members(groupId)).find((x) => x.username === name.replace(/^@/, '').toLowerCase())

bot.on('message', async (m) => {
  if (m.is_bot) return
  if (BAD_WORDS.some((w) => m.content.toLowerCase().includes(w))) {
    await m.delete().catch(() => {})
    await bot.send(m.channel_id, '@' + m.username + ' please keep it friendly.')
  }
})
bot.command('kick', async (m, args) => {
  const who = await find(m.group_id, args[0] || '')
  if (!who) return m.reply('Who? Use: !kick @name')
  await bot.kick(m.group_id, who.user_id)
  return m.reply('Removed ' + who.username)
}, { description: 'Remove someone: !kick @name' })
bot.command('timeout', async (m, args) => {
  const who = await find(m.group_id, args[0] || '')
  if (!who) return m.reply('Who? Use: !timeout @name 10')
  await bot.timeout(m.group_id, who.user_id, parseInt(args[1], 10) || 10)
  return m.reply(who.username + ' is quiet for a while.')
}, { description: 'Time someone out: !timeout @name minutes' })
bot.command('purge', async (m, args) => m.reply('Removed ' + (await bot.purge(m.channel_id, parseInt(args[0], 10) || 10)) + ' messages'), { description: 'Delete the latest messages: !purge 20' })`],
  ['faq', 'Auto-replies and Q&A', 'Answers questions when people say certain words, and !faq.', `const ANSWERS = [   // edit me: when a message contains one of the words, the bot answers
  { words: ['how do i join', 'invite link'], reply: 'Ask a moderator for an invite code.' },
  { words: ['server ip', 'how to connect'], reply: 'The address is on the pinned message in #info.' },
]
bot.on('message', async (m) => {
  if (m.is_bot || m.content.startsWith(bot.prefix)) return
  const hit = ANSWERS.find((a) => a.words.some((w) => m.content.toLowerCase().includes(w)))
  if (hit) await m.reply(hit.reply)
})
bot.command('faq', (m) => m.reply('**Frequently asked**\\n' + ANSWERS.map((a) => '• ' + a.words[0]).join('\\n')), { description: 'List the questions I can answer' })`],
  ['ai', 'AI chat bot (OpenAI)', 'Answers !ask and @mentions with ChatGPT. Needs your own OpenAI key.', `// Needs an OpenAI API key from platform.openai.com, set as OPENAI_API_KEY (see the guide).
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const memory = new Map()   // short memory per channel

async function ask(channelId, who, text) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return 'The owner has not set OPENAI_API_KEY yet.'
  const history = memory.get(channelId) || []
  history.push({ role: 'user', content: who + ': ' + text })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: 'You are a friendly assistant in a chat group. Keep answers short.' }, ...history.slice(-10)] }),
  })
  const data = await res.json()
  if (!res.ok) return 'The AI service said: ' + (data.error?.message || res.status)
  const answer = (data.choices?.[0]?.message?.content || '...').slice(0, 1900)
  history.push({ role: 'assistant', content: answer })
  memory.set(channelId, history.slice(-10))
  return answer
}
bot.command('ask', async (m, args, text) => m.reply(await ask(m.channel_id, m.username, text || 'Hello!')), { description: 'Ask the AI: !ask what is a black hole?', cooldown: 5 })
bot.on('mention', async (m) => { if (!m.content.startsWith(bot.prefix)) await m.reply(await ask(m.channel_id, m.username, m.content)) })`],
  ['blank', 'Blank', 'Just the basics, for you (or an AI) to fill in.', `bot.on('ready', (me) => console.log('Online as', me.name))
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check that I am awake' })
// Add your own commands here.`],
]

// One self-contained file: the library plus the chosen template. Needs only Node.js.
export async function buildStarter(templateId, key) {
  const lib = await (await fetch('/sdk/nook-bot.mjs')).text()
  const t = TEMPLATES.find((x) => x[0] === templateId) || TEMPLATES[0]
  const inline = lib.replace(/^export class NookBot/m, 'class NookBot')
  const k = key ? `'${key}'` : "process.env.NOOK_KEY || 'PASTE-YOUR-CONNECT-KEY'"
  return `// ${t[1]}: made with the Nook Developer portal. Run it with:  node mybot.mjs   (or double-click start.bat on Windows)
// Keep this file private: it contains your bot's key. Everything between the lines below is the Nook library.

// ───────── Nook bot library (you can ignore this part) ─────────
${inline.trim()}
// ───────── Your bot starts here ─────────

const bot = new NookBot({ key: ${k} })

${t[3]}

bot.start()
`
}
export const START_BAT = `@echo off
title Nook bot
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start https://nodejs.org
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
export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
