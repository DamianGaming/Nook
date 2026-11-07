// Starter bots for the Developer portal and the docs, in Node.js and Python. Each entry: [id, name, description, node code, python code].
// The code is what goes under the header the portal writes (the NookBot import and the "bot" variable), and above bot.start() / bot.run().
// Bots keep their own data: the SQLite example shows how.
export const TEMPLATES = [
  ['hello', 'Hello bot', 'Slash commands: /ping, /roll, /flip, /vote.', `bot.on('ready', async (me) => {
  console.log('Online as', me.name)
  await bot.setStatus('playing', 'with /roll')
})

bot.slash('ping', { description: 'Check that I am awake' }, (i) => i.reply('pong!'))

bot.slash('roll', {
  description: 'Roll a die',
  options: [{ name: 'sides', description: 'How many sides (default 6)', type: 'integer' }],
}, (i) => {
  const sides = Math.min(Math.max(i.options.sides || 6, 2), 1000)
  return i.reply('🎲 ' + i.username + ' rolled **' + (1 + Math.floor(Math.random() * sides)) + '** (d' + sides + ')')
})

bot.slash('flip', { description: 'Flip a coin' }, (i) => i.reply(Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails'))

bot.slash('vote', {
  description: 'Start a poll',
  options: [
    { name: 'question', description: 'What to ask', required: true },
    { name: 'answers', description: 'Answers separated by commas, for example: Pizza, Tacos', required: true },
  ],
}, async (i) => {
  const answers = i.options.answers.split(',').map((x) => x.trim()).filter(Boolean)
  if (answers.length < 2) return i.hidden('Give at least two answers, separated by commas.')
  await bot.poll(i.channel_id, i.options.question, answers)
  return i.hidden('Poll posted!')
})

// The old way still works too: type !ping
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check that I am awake' })`, `import random

@bot.on('ready')
def ready(me):
    print('Online as', me['name'])
    bot.set_status('playing', 'with /roll')

@bot.slash('ping', description='Check that I am awake')
def ping(i):
    i.reply('pong!')

@bot.slash('roll', description='Roll a die', options=[{'name': 'sides', 'description': 'How many sides (default 6)', 'type': 'integer'}])
def roll(i):
    sides = min(max(i.options.sides or 6, 2), 1000)
    i.reply('🎲 %s rolled **%d** (d%d)' % (i.username, random.randint(1, sides), sides))

@bot.slash('flip', description='Flip a coin')
def flip(i):
    i.reply('🪙 Heads' if random.random() < 0.5 else '🪙 Tails')

@bot.slash('vote', description='Start a poll', options=[
    {'name': 'question', 'description': 'What to ask', 'required': True},
    {'name': 'answers', 'description': 'Answers separated by commas, for example: Pizza, Tacos', 'required': True},
])
def vote(i):
    answers = [x.strip() for x in i.options.answers.split(',') if x.strip()]
    if len(answers) < 2:
        return i.hidden('Give at least two answers, separated by commas.')
    bot.poll(i.channel_id, i.options.question, answers)
    i.hidden('Poll posted!')

# The old way still works too: type !ping
@bot.command('ping', description='Check that I am awake')
def old_ping(m, args):
    m.reply('pong!')`],
  ['showcase', 'Show-off bot', 'Embeds, buttons, dropdown menus and hidden messages, all in one.', `bot.slash('card', { description: 'Show a nice embed card' }, (i) => i.reply({
  embed: {
    author: { name: 'Nook bot demo' },
    title: 'Hello, ' + i.username + '!',
    description: 'This is an **embed**. It can hold *formatting*, fields, pictures and more.',
    color: '#6475f5',
    fields: [['Server', i.group_name, true], ['Channel', '#' + i.channel_name, true], ['Tip', 'Try the buttons below']],
    footer: 'Made with Nook',
    timestamp: true,
  },
  buttons: [
    { id: 'demo:like', label: 'Like', style: 'success' },
    { id: 'demo:secret', label: 'Tell me a secret', style: 'primary' },
    { label: 'Documentation', url: 'https://example.com' },
  ],
  select: { id: 'demo:color', placeholder: 'Pick a favourite colour', options: [
    { label: 'Red', value: 'red', description: 'Warm' },
    { label: 'Blue', value: 'blue', description: 'Cool' },
    { label: 'Green', value: 'green' },
  ] },
}))

let likes = 0
bot.button('demo:like', (i) => { likes += 1; return i.reply('❤️ ' + i.username + ' liked it (' + likes + ' total)') })
bot.button('demo:secret', (i) => i.hidden('🤫 Only you can see this message: the bot loves you.'))
bot.select('demo:color', (i) => i.hidden('You picked **' + i.value + '**.'))`, `@bot.slash('card', description='Show a nice embed card')
def card(i):
    i.reply({
        'embed': {
            'author': {'name': 'Nook bot demo'},
            'title': 'Hello, %s!' % i.username,
            'description': 'This is an **embed**. It can hold *formatting*, fields, pictures and more.',
            'color': '#6475f5',
            'fields': [['Server', i.group_name, True], ['Channel', '#' + i.channel_name, True], ['Tip', 'Try the buttons below']],
            'footer': 'Made with Nook',
            'timestamp': True,
        },
        'buttons': [
            {'id': 'demo:like', 'label': 'Like', 'style': 'success'},
            {'id': 'demo:secret', 'label': 'Tell me a secret', 'style': 'primary'},
            {'label': 'Documentation', 'url': 'https://example.com'},
        ],
        'select': {'id': 'demo:color', 'placeholder': 'Pick a favourite colour', 'options': [
            {'label': 'Red', 'value': 'red', 'description': 'Warm'},
            {'label': 'Blue', 'value': 'blue', 'description': 'Cool'},
            {'label': 'Green', 'value': 'green'},
        ]},
    })

likes = {'n': 0}

@bot.button('demo:like')
def like(i):
    likes['n'] += 1
    i.reply('❤️ %s liked it (%d total)' % (i.username, likes['n']))

@bot.button('demo:secret')
def secret(i):
    i.hidden('🤫 Only you can see this message: the bot loves you.')

@bot.select('demo:color')
def colour(i):
    i.hidden('You picked **%s**.' % i.value)`],
  ['welcome', 'Welcome and rules', 'Greets new members with a card and a Rules button.', `const WELCOME_CHANNEL = 'general'   // the channel to greet people in
const RULES = ['Be kind.', 'No spam.', 'Keep it on topic.']   // edit me
const rulesText = () => '**Rules**\\n' + RULES.map((r, i) => (i + 1) + '. ' + r).join('\\n')

bot.on('memberJoin', async (e) => {
  const ch = await bot.channel(WELCOME_CHANNEL)
  if (!ch) return
  await bot.send(ch.id, {
    content: 'Welcome, @' + e.username + '!',
    embed: { title: 'Glad you are here', description: 'Say hi, and have a look at the rules.', color: '#3ba55d' },
    buttons: [{ id: 'rules', label: 'Show the rules', style: 'primary' }],
  })
})
bot.button('rules', (i) => i.hidden(rulesText()))
bot.slash('rules', { description: 'Show the rules' }, (i) => i.reply(rulesText()))`, `WELCOME_CHANNEL = 'general'   # the channel to greet people in
RULES = ['Be kind.', 'No spam.', 'Keep it on topic.']   # edit me

def rules_text():
    return '**Rules**\\n' + '\\n'.join('%d. %s' % (n + 1, r) for n, r in enumerate(RULES))

@bot.on('member_join')
def welcome(e):
    ch = bot.channel(WELCOME_CHANNEL)
    if not ch:
        return
    bot.send(ch.id, {
        'content': 'Welcome, @%s!' % e.username,
        'embed': {'title': 'Glad you are here', 'description': 'Say hi, and have a look at the rules.', 'color': '#3ba55d'},
        'buttons': [{'id': 'rules', 'label': 'Show the rules', 'style': 'primary'}],
    })

@bot.button('rules')
def rules_button(i):
    i.hidden(rules_text())

@bot.slash('rules', description='Show the rules')
def rules(i):
    i.reply(rules_text())`],
  ['mod', 'Moderator', 'Word filter and /kick, /timeout, /purge. Needs the Moderator permissions.', `const BAD_WORDS = ['badword1', 'badword2']   // edit me

const find = async (groupId, username) => (await bot.members(groupId)).find((x) => x.username === username)

bot.on('message', async (m) => {
  if (m.is_bot) return
  if (BAD_WORDS.some((w) => m.content.toLowerCase().includes(w))) {
    await m.delete().catch(() => {})
    await bot.send(m.channel_id, '@' + m.username + ' please keep it friendly.')
  }
})

bot.slash('kick', { description: 'Remove someone from the group', options: [{ name: 'user', description: 'Who', type: 'user', required: true }] }, async (i) => {
  const who = await find(i.group_id, i.options.user)
  if (!who) return i.hidden('I cannot find them.')
  await bot.kick(i.group_id, who.user_id)
  return i.reply('Removed ' + who.username)
})

bot.slash('timeout', {
  description: 'Stop someone chatting for a while',
  options: [{ name: 'user', description: 'Who', type: 'user', required: true }, { name: 'minutes', description: 'How long (default 10)', type: 'integer' }],
}, async (i) => {
  const who = await find(i.group_id, i.options.user)
  if (!who) return i.hidden('I cannot find them.')
  await bot.timeout(i.group_id, who.user_id, i.options.minutes || 10)
  return i.reply(who.username + ' is quiet for a while.')
})

bot.slash('purge', { description: 'Delete the latest messages here', options: [{ name: 'count', description: 'How many (max 100)', type: 'integer', required: true }] }, async (i) => {
  const n = await bot.purge(i.channel_id, i.options.count)
  return i.hidden('Removed ' + n + ' messages.')
})`, `BAD_WORDS = ['badword1', 'badword2']   # edit me

def find(group_id, username):
    return next((x for x in bot.members(group_id) if x.username == username), None)

@bot.on('message')
def word_filter(m):
    if m.is_bot:
        return
    if any(w in m.content.lower() for w in BAD_WORDS):
        try:
            m.delete()
        except Exception:
            pass
        bot.send(m.channel_id, '@%s please keep it friendly.' % m.username)

@bot.slash('kick', description='Remove someone from the group', options=[{'name': 'user', 'description': 'Who', 'type': 'user', 'required': True}])
def kick(i):
    who = find(i.group_id, i.options.user)
    if not who:
        return i.hidden('I cannot find them.')
    bot.kick(i.group_id, who.user_id)
    i.reply('Removed ' + who.username)

@bot.slash('timeout', description='Stop someone chatting for a while', options=[
    {'name': 'user', 'description': 'Who', 'type': 'user', 'required': True},
    {'name': 'minutes', 'description': 'How long (default 10)', 'type': 'integer'},
])
def timeout(i):
    who = find(i.group_id, i.options.user)
    if not who:
        return i.hidden('I cannot find them.')
    bot.timeout(i.group_id, who.user_id, i.options.minutes or 10)
    i.reply(who.username + ' is quiet for a while.')

@bot.slash('purge', description='Delete the latest messages here', options=[{'name': 'count', 'description': 'How many (max 100)', 'type': 'integer', 'required': True}])
def purge(i):
    n = bot.purge(i.channel_id, i.options.count)
    i.hidden('Removed %d messages.' % n)`],
  ['faq', 'Help desk', 'A /help menu with answers, and auto-replies to common questions.', `const ANSWERS = [   // edit me
  { topic: 'How do I join?', words: ['how do i join', 'invite link'], reply: 'Ask a moderator for an invite code.' },
  { topic: 'Server address', words: ['server ip', 'how to connect'], reply: 'The address is on the pinned message in #info.' },
]

bot.slash('help', { description: 'Get help' }, (i) => i.hidden({
  content: 'What do you need help with?',
  select: { id: 'faq', placeholder: 'Choose a topic', options: ANSWERS.map((a, n) => ({ label: a.topic, value: String(n) })) },
}))
bot.select('faq', (i) => i.hidden(ANSWERS[Number(i.value)]?.reply || 'Sorry, I do not know that one.'))

bot.on('message', async (m) => {
  if (m.is_bot || m.content.startsWith(bot.prefix)) return
  const hit = ANSWERS.find((a) => a.words.some((w) => m.content.toLowerCase().includes(w)))
  if (hit) await m.reply(hit.reply)
})`, `ANSWERS = [   # edit me
    {'topic': 'How do I join?', 'words': ['how do i join', 'invite link'], 'reply': 'Ask a moderator for an invite code.'},
    {'topic': 'Server address', 'words': ['server ip', 'how to connect'], 'reply': 'The address is on the pinned message in #info.'},
]

@bot.slash('help', description='Get help')
def help_menu(i):
    i.hidden({
        'content': 'What do you need help with?',
        'select': {'id': 'faq', 'placeholder': 'Choose a topic', 'options': [{'label': a['topic'], 'value': str(n)} for n, a in enumerate(ANSWERS)]},
    })

@bot.select('faq')
def faq_answer(i):
    n = int(i.value)
    i.hidden(ANSWERS[n]['reply'] if 0 <= n < len(ANSWERS) else 'Sorry, I do not know that one.')

@bot.on('message')
def auto_reply(m):
    if m.is_bot or m.content.startswith(bot.prefix):
        return
    for a in ANSWERS:
        if any(w in m.content.lower() for w in a['words']):
            m.reply(a['reply'])
            break`],
  ['points', 'Points and leaderboard (SQLite)', 'Remembers points in a SQLite database file, so nothing is lost on restart.', `// Remembers points in a SQLite file (points.db) next to the bot, so nothing is lost when it restarts.
import Database from 'better-sqlite3'

const db = new Database('points.db')
db.exec('CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)')
const addPoint = db.prepare('INSERT INTO points (user, total) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET total = total + 1')
const getPoints = db.prepare('SELECT total FROM points WHERE user = ?')
const topTen = db.prepare('SELECT user, total FROM points ORDER BY total DESC LIMIT 10')

bot.on('message', (m) => { if (!m.is_bot && !m.content.startsWith('/')) addPoint.run(m.username) })   // 1 point per message

bot.slash('points', { description: 'See how many points someone has', options: [{ name: 'user', description: 'Who (default: you)', type: 'user' }] }, (i) => {
  const who = i.options.user || i.username
  return i.reply(who + ' has **' + (getPoints.get(who)?.total ?? 0) + '** points')
})

bot.slash('top', { description: 'The top 10' }, (i) => i.reply({
  embed: {
    title: '🏆 Leaderboard',
    color: '#f0b232',
    description: topTen.all().map((r, n) => (n + 1) + '. **' + r.user + '**: ' + r.total).join('\\n') || 'Nobody has any points yet.',
  },
}))`, `# Remembers points in a SQLite file (points.db) next to the bot, so nothing is lost when it restarts.
import sqlite3
import threading

db = sqlite3.connect('points.db', check_same_thread=False)
lock = threading.Lock()   # commands run on several threads, so take turns with the database
db.execute('CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)')
db.commit()

@bot.on('message')
def count(m):   # 1 point per message
    if m.is_bot or m.content.startswith('/'):
        return
    with lock:
        db.execute('INSERT INTO points (user, total) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET total = total + 1', (m.username,))
        db.commit()

@bot.slash('points', description='See how many points someone has', options=[{'name': 'user', 'description': 'Who (default: you)', 'type': 'user'}])
def points(i):
    who = i.options.user or i.username
    with lock:
        row = db.execute('SELECT total FROM points WHERE user = ?', (who,)).fetchone()
    i.reply('%s has **%d** points' % (who, row[0] if row else 0))

@bot.slash('top', description='The top 10')
def top(i):
    with lock:
        rows = db.execute('SELECT user, total FROM points ORDER BY total DESC LIMIT 10').fetchall()
    i.reply({'embed': {'title': '🏆 Leaderboard', 'color': '#f0b232',
                       'description': '\\n'.join('%d. **%s**: %d' % (n + 1, u, t) for n, (u, t) in enumerate(rows)) or 'Nobody has any points yet.'}})`],
  ['ai', 'AI chat bot (OpenAI)', '/ask and @mentions answered by ChatGPT. Needs your own OpenAI key.', `// Needs an OpenAI API key from platform.openai.com, set as OPENAI_API_KEY (see the guide).
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

bot.slash('ask', {
  description: 'Ask the AI a question',
  options: [{ name: 'question', description: 'What do you want to know?', required: true }, { name: 'private', description: 'Only show the answer to me', type: 'boolean' }],
}, async (i) => i.reply(await ask(i.channel_id, i.username, i.options.question), { hidden: !!i.options.private }))

bot.on('mention', async (m) => { if (!m.content.startsWith(bot.prefix)) await m.reply(await ask(m.channel_id, m.username, m.content)) })`, `import json, os, urllib.request

# Needs an OpenAI API key from platform.openai.com. Put OPENAI_API_KEY=sk-... in the .env file next to this bot.
MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
memory = {}   # short memory per channel (lost when the bot restarts)

def ask(channel_id, who, text):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        return 'The owner has not set OPENAI_API_KEY yet.'
    history = memory.setdefault(channel_id, [])
    history.append({'role': 'user', 'content': '%s: %s' % (who, text)})
    body = json.dumps({'model': MODEL, 'messages': [{'role': 'system', 'content': 'You are a friendly assistant in a chat group. Keep answers short.'}] + history[-10:]}).encode()
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=body, headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
    except Exception as e:
        return 'The AI service did not answer: %s' % e
    answer = (data['choices'][0]['message']['content'] or '...')[:1900]
    history.append({'role': 'assistant', 'content': answer})
    del history[:-10]
    return answer

@bot.slash('ask', description='Ask the AI a question', options=[
    {'name': 'question', 'description': 'What do you want to know?', 'required': True},
    {'name': 'private', 'description': 'Only show the answer to me', 'type': 'boolean'},
])
def ask_command(i):
    i.reply(ask(i.channel_id, i.username, i.options.question), hidden=bool(i.options.private))

@bot.on('mention')
def on_mention(m):
    if not m.content.startswith(bot.prefix):
        m.reply(ask(m.channel_id, m.username, m.content))`],
  ['blank', 'Blank', 'Just the basics, for you (or an AI) to fill in.', `bot.on('ready', (me) => console.log('Online as', me.name))
bot.slash('ping', { description: 'Check that I am awake' }, (i) => i.reply('pong!'))
// Add your own commands here.`, `@bot.on('ready')
def ready(me):
    print('Online as', me['name'])

@bot.slash('ping', description='Check that I am awake')
def ping(i):
    i.reply('pong!')

# Add your own commands here.`],
]
