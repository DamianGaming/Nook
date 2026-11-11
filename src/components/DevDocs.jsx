import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Icon from './Icon.jsx'
import { PERMS, PRESETS, LIB, PY_REF, TEMPLATES, aiPrompt, NODE_LIB_URL, PY_LIB_URL } from '../botDocs.js'
import { LangPick, AssembleBox, saveProject } from './BotKit.jsx'

const URL_ = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co'
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR-ANON-KEY'
const SITE = typeof location !== 'undefined' ? location.origin : 'https://YOUR-SITE'

function Code({ children, label }) {
  const [done, setDone] = useState(false)
  const text = String(children).replace(/^\n/, '')
  return (
    <div className="doc-code">
      {label && <span className="doc-code-label">{label}</span>}
      <button className="ghost small" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}>{done ? 'Copied' : 'Copy'}</button>
      <pre tabIndex={0}><code>{text}</code></pre>
    </div>
  )
}
// Code that is shown in Node.js or Python: the choice is remembered and shared by every example on the page.
let lang = (() => { try { return localStorage.getItem('nook-docs-lang') === 'py' ? 'py' : 'js' } catch { return 'js' } })()
const langSubs = new Set()
const setLang = (l) => { lang = l; try { localStorage.setItem('nook-docs-lang', l) } catch { /* private window */ } langSubs.forEach((f) => f()) }
const useLang = () => useSyncExternalStore((f) => { langSubs.add(f); return () => langSubs.delete(f) }, () => lang)
function Both({ js, py, label }) {
  const l = useLang()
  return (
    <div className="doc-both">
      <LangPick lang={l} onChange={setLang} />
      <Code label={label ? `${label}${l === 'py' ? '.py' : '.mjs'}` : l === 'py' ? 'mybot.py' : 'mybot.mjs'}>{l === 'py' ? py : js}</Code>
    </div>
  )
}
const Note = ({ kind = 'tip', title, children }) => <div className={`doc-note ${kind}`}><strong>{title || (kind === 'warn' ? 'Careful' : 'Tip')}</strong><div>{children}</div></div>
const Table = ({ head, rows }) => (
  <div className="docs-table-wrap"><table className="docs-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{j === 0 ? <code>{c}</code> : c}</td>)}</tr>)}</tbody></table></div>
)
const Steps = ({ children }) => <ol className="doc-steps">{children}</ol>

const PAGES = [
  ['Get started', [['overview', 'Welcome'], ['start', 'Quick start'], ['starter', 'Starter bots'], ['ai', 'Build with AI'], ['run', 'Running your bot']]],
  ['Build', [['library', 'Library reference'], ['python', 'Python guide'], ['slash', 'Slash commands'], ['interactive', 'Buttons and hidden messages'], ['events', 'Events'], ['messages', 'Messages and embeds'], ['permissions', 'Permissions'], ['storage', 'Remembering things']]],
  ['Reference', [['limits', 'Limits and safety'], ['help', 'Troubleshooting']]],
]
const ORDER = PAGES.flatMap(([, items]) => items)

function Overview({ go }) {
  const cards = [
    ['Slash commands', 'People type / and see your commands above the message box, with options to fill in.'],
    ['Talk', 'Reply to commands and mentions, post embeds and polls, react, pin.'],
    ['Buttons and menus', 'Add buttons and dropdowns to messages and react when people use them.'],
    ['Hidden replies', 'Answer so that only one person sees it, like Discord\'s ephemeral messages.'],
    ['Look', 'Read history, list members and channels, see polls and reactions.'],
    ['Moderate', 'Kick, time out, delete messages and manage channels, only where you grant it.'],
    ['Remember', 'Keep scores and settings in your own SQLite or MySQL database.'],
    ['Show status', '"Playing Chess" next to the bot\'s name.'],
    ['React to news', 'Edits, reactions and people joining arrive as events.'],
  ]
  return (
    <>
      <h1>Build a Nook bot</h1>
      <p className="lead">A bot is a small program, written in <strong>Node.js or Python</strong>, that joins your groups, listens, and acts. Run it on your own computer, a Raspberry Pi or a server. It only makes outgoing connections, so there is nothing to open on your router and no web address to set up.</p>
      <div className="doc-cards">{cards.map(([t, d]) => <div key={t} className="doc-card"><strong>{t}</strong><span>{d}</span></div>)}</div>
      <h2>How it works</h2>
      <div className="doc-flow" aria-label="How a bot talks to Nook">
        <div><strong>Your bot</strong><span>runs anywhere</span></div>
        <span className="doc-arrow" aria-hidden="true">asks "anything new?" every moment <b>&rarr;</b></span>
        <div><strong>Nook</strong><span>answers over HTTPS</span></div>
      </div>
      <p>Your bot signs in with a secret <strong>token</strong>. It asks Nook for news a little over once a second, and sends actions (a reply, a kick) the same way. The Nook library (for Node.js or Python, installed like discord.js or discord.py) hides all of that, so a working bot is about ten lines.</p>
      <p className="docs-actions"><button className="primary" onClick={() => go('start')}>Make your first bot</button> <button className="ghost" onClick={() => go('library')}>Browse the library</button></p>
    </>
  )
}

function Start() {
  const l = useLang()
  return (
    <>
      <h1>Quick start</h1>
      <p className="lead">About three minutes. You do not type any addresses or keys: the portal gives you one <strong>connect key</strong> and puts it in a file for you.</p>
      <Steps>
        <li><strong>Create the bot.</strong> Press the <code>&lt;/&gt;</code> button at the top of Nook to open the Developer portal, then <strong>Create a bot</strong>. Choose what it is allowed to do (you can change this later).</li>
        <li><strong>Download your bot folder.</strong> Choose <strong>Node.js</strong> or <strong>Python</strong>, pick a starter, and press <strong>Download bot folder</strong>. You get a zip with your bot file, a <code>.env</code> file holding your key, and <code>start.bat</code>. See <a href="#starter">Starter bots</a>.</li>
        <li><strong>Add it to a group.</strong> In your group open <strong>Group settings &rarr; Members</strong>, paste the bot's <strong>add code</strong> and press <strong>Add to group</strong>. It joins with the permissions you chose.</li>
        <li><strong>Run it.</strong> Install <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (18 or newer) or <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python</a> (3.8 or newer) once, unzip the folder and double-click <code>start.bat</code>. It installs the Nook library and anything else the bot needs, then runs the bot.</li>
      </Steps>
      <p>Type <code>/ping</code> in your group and the bot answers.</p>
      <h2>Prefer to set it up yourself?</h2>
      <p>The library is a normal package that you install, just like discord.js or discord.py. Your bot is then any number of files you like.</p>
      <Both label="Terminal" js={`npm install ${NODE_LIB_URL()}`} py={`pip install ${PY_LIB_URL()}`} />
      <p>Put your connect key in a file called <code>.env</code> next to your bot (the library reads it for you):</p>
      <Code label=".env">{`NOOK_KEY=nkc_...`}</Code>
      <Both label="mybot" js={`import { NookBot } from 'nook-bot'

const bot = new NookBot()          // reads NOOK_KEY from .env

bot.slash('ping', { description: 'Check that I am awake' }, (i) => i.reply('pong!'))
bot.start()`} py={`from nook_bot import NookBot

bot = NookBot()                    # reads NOOK_KEY from .env

@bot.slash('ping', description='Check that I am awake')
def ping(i):
    i.reply('pong!')

bot.run()`} />
      <Both label="Run it" js={`node mybot.mjs`} py={`python mybot.py`} />
      <Note title="Want an AI to write it?">Open <a href="#ai">Build with AI</a>, describe your bot, and paste the ready-made brief into ChatGPT, Claude or Gemini.</Note>
      <Note kind="warn" title="The key is a password">The connect key contains your bot's token. Do not post it or upload it (keep <code>.env</code> out of GitHub). If it leaks, press <strong>New key</strong> on the bot's card.</Note>
      <p className="muted small">Using the library at <code>{l === 'py' ? PY_LIB_URL() : NODE_LIB_URL()}</code>. Re-install it any time to get the newest version.</p>
    </>
  )
}

function Starter() {
  const l = useLang()
  return (
    <>
      <h1>Starter bots</h1>
      <p className="lead">Ready-made bots you can run without writing any code. Pick a language, pick a bot, and edit the few lines marked "edit me".</p>
      <p>The easiest way is in the <strong>Developer portal</strong>: <strong>Download bot folder</strong> puts your connect key in the <code>.env</code> file for you. The buttons below download the same folders with a spot to paste the key.</p>
      <LangPick lang={l} onChange={setLang} />
      <div className="doc-cards">
        {TEMPLATES.map(([id, name, desc]) => (
          <div key={id} className="doc-card"><strong>{name}</strong><span>{desc}</span><button className="ghost small" onClick={() => saveProject({ lang: l, template: id, key: null })}>Download</button></div>
        ))}
      </div>
      <h2>What is in the folder</h2>
      <Table head={['File', 'What it is']} rows={l === 'py' ? [
        ['mybot.py', 'Your bot. This is the file you edit.'],
        ['.env', 'Your connect key (and any other secrets, like an OpenAI key). Keep it private.'],
        ['requirements.txt', 'Extra Python packages your bot uses (empty for most starters).'],
        ['start.bat', 'Windows: installs the libraries, runs the bot, and restarts it if it stops.'],
      ] : [
        ['mybot.mjs', 'Your bot. This is the file you edit.'],
        ['.env', 'Your connect key (and any other secrets, like an OpenAI key). Keep it private.'],
        ['package.json', 'Lists the libraries your bot uses, including nook-bot.'],
        ['start.bat', 'Windows: installs the libraries, runs the bot, and restarts it if it stops.'],
      ]} />
      <p>Need more files? Add them. A bot is an ordinary {l === 'py' ? 'Python' : 'Node.js'} project, so split it up however you like and install any packages you want.</p>
      <h2>Using it</h2>
      <Steps>
        <li>Unzip the folder anywhere, for example <code>C:\bots\mybot</code>.</li>
        <li>If the key is not inside yet, open <code>.env</code> in Notepad and paste your connect key after <code>NOOK_KEY=</code>.</li>
        <li>Double-click <code>start.bat</code>.</li>
      </Steps>
    </>
  )
}

function Ai() {
  const [wish, setWish] = useState('')
  const [done, setDone] = useState(false)
  const l = useLang()
  const text = aiPrompt(wish, l)
  const copyIt = () => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) })
  return (
    <>
      <h1>Build with AI</h1>
      <p className="lead">You do not have to be a programmer. Tell an AI what you want, and it writes the bot for you. Works with ChatGPT, Claude, Gemini, Copilot and others.</p>
      <Steps>
        <li><strong>Describe your bot</strong> in the box below, in plain words.</li>
        <li><strong>Copy the brief</strong> and paste it into your AI chat. It explains Nook's bot library to the AI, so the code it writes just works.</li>
        <li><strong>Paste the AI's answer</strong> into the box further down and press <strong>Make my bot folder</strong>. You get a zip with your bot, a <code>.env</code> file for the key, and <code>start.bat</code>. Any extra packages the AI used are listed for you automatically.</li>
        <li><strong>Run it:</strong> paste your connect key into <code>.env</code>, then double-click <code>start.bat</code> (see <a href="#run">Running your bot</a>).</li>
      </Steps>
      <LangPick lang={l} onChange={setLang} />
      <label className="doc-field">What should your bot do?
        <textarea rows={4} value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Example: answer questions with ChatGPT when someone types !ask, and welcome new members in #general" />
      </label>
      <p className="docs-actions">
        <button className="primary" onClick={copyIt}>{done ? 'Copied' : 'Copy the brief for my AI'}</button>
      </p>
      <details className="doc-details"><summary>See the brief</summary><pre tabIndex={0} className="doc-pre">{text}</pre></details>
      <h2>Make my bot folder</h2>
      <p>Your connect key is not in the folder, so open <code>.env</code> afterwards and paste it. (Doing this from the Developer portal puts the key in for you.)</p>
      <AssembleBox lang={l} />
      <h2>Using ChatGPT or another AI service inside your bot</h2>
      <p>There are two different things, and it helps to keep them apart:</p>
      <ul>
        <li><strong>An AI helping you write the bot</strong> (above). Free in the ChatGPT or Claude apps. Nothing else needed.</li>
        <li><strong>An AI answering inside your group</strong> (a chat bot that replies with ChatGPT). The bot calls the AI company's service, which needs an <strong>API key</strong> from them (usually pay-as-you-go, a few cents for lots of messages). The "AI chat bot" starter does this for you.</li>
      </ul>
      <Steps>
        <li>Make an API key on your AI provider's site (for example platform.openai.com).</li>
        <li>Add it to the <code>.env</code> file in your bot folder as <code>OPENAI_API_KEY=sk-...</code>. It stays on your computer, never inside the bot's code.</li>
        <li>Run the "AI chat bot" starter, or ask your AI to change it to another provider.</li>
      </Steps>
      <Note kind="warn" title="Keep keys private">Never paste an API key or connect key into a chat with an AI, or into a file you share. Leave the placeholder in the code and set the real key on your own computer.</Note>
    </>
  )
}

function Slash() {
  return (
    <>
      <h1>Slash commands</h1>
      <p className="lead">Type <code>/</code> in a group and every command from every bot in it appears above the message box, with its description. Pick one, fill in the options, press Enter.</p>
      <Both js={`bot.slash('roll', {
  description: 'Roll a die',
  options: [{ name: 'sides', description: 'How many sides', type: 'integer' }],
}, (i) => {
  const sides = i.options.sides || 6
  return i.reply('🎲 ' + i.username + ' rolled ' + (1 + Math.floor(Math.random() * sides)))
})`} py={`import random

@bot.slash('roll', description='Roll a die', options=[
    {'name': 'sides', 'description': 'How many sides', 'type': 'integer'},
])
def roll(i):
    sides = i.options.sides or 6
    i.reply('🎲 %s rolled %d' % (i.username, random.randint(1, sides)))`} />
      <p>The library publishes your commands when the bot starts, so there is nothing to register by hand. Change them and restart, and the menu updates within a minute.</p>
      <h2>Options</h2>
      <Table head={['type', 'What the person sees', 'You get']} rows={[
        ['string', 'A text box (or a list when you give choices)', 'Text'],
        ['integer', 'A number box (whole numbers)', 'A number'],
        ['number', 'A number box (decimals allowed)', 'A number'],
        ['boolean', 'A switch', 'true or false'],
        ['user', 'A list of the group\'s members', 'The username, for example "sam"'],
        ['channel', 'A text box', 'The channel name'],
      ]} />
      <p>Add <code>required: true</code> (Python: <code>'required': True</code>) to make an option compulsory, or <code>choices: ['small', 'large']</code> for a fixed list. Nook checks everything before your bot hears about it: required options are filled, numbers are numbers, users exist in the group, choices are from the list.</p>
      <h2>Answering</h2>
      <Table head={['Call', 'What happens']} rows={[
        ['i.reply(text)', 'A message everyone sees.'],
        ['i.reply(text, { hidden: true }) or i.hidden(text)', 'A message only that person sees, with "Only you can see this". (Python: i.reply(text, hidden=True).)'],
        ['i.reply({ content, embed, buttons, select })', 'Anything a message can hold. See Buttons and hidden messages.'],
        ['i.say(text)', 'Post in the channel without it counting as the answer.'],
      ]} />
      <p>Answer within <strong>15 minutes</strong>. You may answer more than once, so slow work (like asking an AI) is fine. People also see a small "sent to your bot" note while they wait.</p>
      <Note title="People can type it in full too">Typing <code>/roll 20</code> and pressing Enter works as well: the words fill the options in order.</Note>
      <h2>Rules for names</h2>
      <p>Command and option names are lowercase letters, numbers, <code>-</code> and <code>_</code> (up to 32 characters). Descriptions are 1 to 100 characters. A bot can have up to 200 commands with 10 options each. People also see a few built-in commands of Nook itself (/shrug, /me, /spoiler, /embed, /poll, /activity) in the same list.</p>
    </>
  )
}

function Interactive() {
  return (
    <>
      <h1>Buttons and hidden messages</h1>
      <h2>Buttons and menus</h2>
      <p>Bot messages can carry buttons and a dropdown menu. When someone uses one, your bot is told and can answer.</p>
      <Both js={`bot.slash('poll', { description: 'Ask a quick question' }, (i) => i.reply({
  content: 'Pizza tonight?',
  buttons: [
    { id: 'vote:yes', label: 'Yes', style: 'success' },
    { id: 'vote:no', label: 'No', style: 'danger' },
    { label: 'Menu', url: 'https://example.com/menu' },     // a link button
  ],
}))

bot.button('vote:*', (i) => i.hidden('Thanks! You voted ' + i.name.split(':')[1]))   // "vote:*" matches both ids

bot.slash('colour', { description: 'Pick a colour' }, (i) => i.reply({
  select: { id: 'colour', placeholder: 'Choose…', options: [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue', description: 'Cool' }] },
}))
bot.select('colour', (i) => i.update('You picked ' + i.value))        // change the message itself`} py={`@bot.slash('poll', description='Ask a quick question')
def poll(i):
    i.reply({
        'content': 'Pizza tonight?',
        'buttons': [
            {'id': 'vote:yes', 'label': 'Yes', 'style': 'success'},
            {'id': 'vote:no', 'label': 'No', 'style': 'danger'},
            {'label': 'Menu', 'url': 'https://example.com/menu'},     # a link button
        ],
    })

@bot.button('vote:*')                  # "vote:*" matches both ids
def voted(i):
    i.hidden('Thanks! You voted ' + i.name.split(':')[1])

@bot.slash('colour', description='Pick a colour')
def colour(i):
    i.reply({'select': {'id': 'colour', 'placeholder': 'Choose…', 'options': [{'label': 'Red', 'value': 'red'}, {'label': 'Blue', 'value': 'blue', 'description': 'Cool'}]}})

@bot.select('colour')
def picked(i):
    i.update('You picked ' + i.value)  # change the message itself`} />
      <Table head={['Thing', 'Details']} rows={[
        ['Button styles', 'primary, secondary, success, danger. Give url instead of id for a link button.'],
        ['Buttons per message', 'Up to 10.'],
        ['Menu', 'One dropdown with up to 25 options, each with an optional description.'],
        ['i.update(...)', 'Change the message that held the button, for example to show a result or disable the buttons.'],
        ['i.value / i.values', 'What was picked in a menu.'],
        ['Ids', 'Letters, numbers, : . _ - (up to 64 characters). Use a prefix like "vote:" to carry data.'],
      ]} />
      <Note title="Buttons that run code only work on messages from your bot">People can add link buttons to the embeds they send, but buttons that run code belong to bots, and only work while the bot is running.</Note>
      <h2>Hidden messages</h2>
      <p>A hidden message is shown only to the person who ran the command or pressed the button, with a note saying <em>Only you can see this</em>. It never reaches anyone else, is not saved in the chat history, and disappears after about an hour (or when they close it).</p>
      <Both js={`bot.slash('secret', { description: 'Tell me a secret' }, (i) => i.hidden('Only **you** can see this, ' + i.username + '.'))`} py={`@bot.slash('secret', description='Tell me a secret')
def secret(i):
    i.hidden('Only **you** can see this, %s.' % i.username)`} />
      <p>Hidden messages can hold embeds too. Buttons inside them are not clickable.</p>
      <h2>Spoilers</h2>
      <p>Wrap text in <code>||two bars||</code> and people click to reveal it. It works in every message and embed.</p>
    </>
  )
}

function Run() {
  const l = useLang()
  const py = l === 'py'
  return (
    <>
      <h1>Running your bot</h1>
      <p className="lead">A bot only needs to be running to answer. While it is off, it simply misses things.</p>
      <Note title="Online and offline">While your bot is running it shows a green <strong>online</strong> dot next to its name in the member list. If it stops for more than a minute or so, the dot goes away. Nothing to set up: any call the library makes counts.</Note>
      <LangPick lang={l} onChange={setLang} />
      <h2>On your own Windows PC</h2>
      <Steps>
        <li>Install {py ? <><a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python</a> 3.8 or newer (tick "Add python to PATH")</> : <><a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> 18 or newer</>} once.</li>
        <li>Unzip your bot folder, for example to <code>C:\bots\mybot</code>.</li>
        <li>Double-click <code>start.bat</code>. It fetches the newest Nook library and your packages, runs the bot, and starts it again after 5 seconds if it stops. Close the window and the bot stops.</li>
        <li>To start it with Windows, open <strong>Task Scheduler &rarr; Create Basic Task</strong>, trigger <em>When I log on</em>, action <em>Start a program</em>: program <code>C:\bots\mybot\start.bat</code>.</li>
      </Steps>
      <Note kind="warn" title="Where to keep the key">The connect key lives in the <code>.env</code> file next to your bot. Do not upload or share that file (if you use git, add <code>.env</code> to <code>.gitignore</code>). Real environment variables also work: <code>setx NOOK_KEY "nkc_..."</code> on Windows, then open a new window.</Note>
      <h2>By hand, on any computer</h2>
      <Both label="Terminal" js={`npm install                 # installs nook-bot and anything else in package.json
node mybot.mjs`} py={`pip install -r requirements.txt
pip install --upgrade --force-reinstall --no-deps ${PY_LIB_URL()}
python mybot.py`} />
      <h2>Keep it running</h2>
      <Both label="Restart it if it crashes" js={`npm install -g pm2
pm2 start mybot.mjs --name mybot
pm2 save`} py={`pip install supervisor      # or use pm2:  pm2 start mybot.py --interpreter python3 --name mybot
# On Linux a systemd service with Restart=always does the same job.`} />
      <h2>Other places</h2>
      <Table head={['Where', 'Good for']} rows={[
        ['Your PC', 'Free, fine while your PC is on.'],
        ['Raspberry Pi', 'Always on and tiny. Same steps as Linux.'],
        ['A small server (VPS)', 'Always on, about the price of a coffee a month. Use pm2 or a systemd service.'],
        ['Free hosts (Railway, Fly.io, Render workers)', 'Any host that can run a Node.js or Python program in the background.'],
      ]} />
      <p>The bot never needs to be reachable from the internet, so a firewall or home router is not a problem.</p>
    </>
  )
}

function Library() {
  return (
    <>
      <h1>Library reference</h1>
      <p className="lead">Every method of the Nook library. The names below are the Node.js ones, and every method returns a promise (use <code>await</code>). Python has the same methods in <code>snake_case</code>, and they simply return their result: see the <a href="#python">Python guide</a>.</p>
      {LIB.map(([group, rows]) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="docs-table-wrap"><table className="docs-table"><tbody>{rows.map(([sig, d]) => <tr key={sig}><td><code>{sig}</code></td><td>{d}</td></tr>)}</tbody></table></div>
        </section>
      ))}
    </>
  )
}

function Python() {
  return (
    <>
      <h1>Python guide</h1>
      <p className="lead">The Python library does everything the Node.js one does, with the same names in Python style. It needs Python 3.8 or newer and no other packages.</p>
      <Code label="Install">{`pip install ${PY_LIB_URL()}`}</Code>
      <h2>Differences from Node.js</h2>
      <Table head={['Node.js', 'Python']} rows={[
        ['new NookBot()', 'NookBot()'],
        ['bot.start()', 'bot.run()   (blocks until you press Ctrl+C)'],
        ['bot.slash("roll", { description, options }, (i) => ...)', "@bot.slash('roll', description=..., options=[...])  above  def roll(i): ..."],
        ['bot.button("id", (i) => ...) / bot.select(...)', "@bot.button('id')  /  @bot.select('id')"],
        ['bot.command("ping", (m, args) => ..., { description, cooldown })', "@bot.command('ping', description=..., cooldown=5)"],
        ['bot.on("memberJoin", fn)', "@bot.on('member_join')"],
        ['bot.getMessage, bot.createChannel, bot.setStatus ...', 'bot.get_message, bot.create_channel, bot.set_status ... (camelCase becomes snake_case)'],
        ['i.reply(x, { hidden: true })', 'i.reply(x, hidden=True)'],
        ['footerIcon', 'footer_icon'],
        ['await bot.send(...)', 'bot.send(...)  (no await: calls simply wait for the answer)'],
        ['{ description: "x" }', "{'description': 'x'}  (dictionaries need quotes around the keys)"],
      ]} />
      <p>Each command and button runs on its own thread, so a slow command (like asking an AI) never blocks the others. Messages, interactions and members are dictionaries you can also read with dots: <code>m.content</code>, <code>i.options.sides</code>.</p>
      <h2>Everything at a glance</h2>
      <Code label="Python">{PY_REF}</Code>
    </>
  )
}

function Events() {
  return (
    <>
      <h1>Events</h1>
      <p className="lead">Listen with <code>bot.on("name", (e) =&gt; ...)</code>. Your own actions never come back as events.</p>
      <Table head={['Event', 'Happens when']} rows={[
        ['message', 'Someone posts in a channel the bot can see.'],
        ['mention', 'A message mentions @yourbot or replies to one of its messages. (message fires too.)'],
        ['edit', 'Someone edits a message.'],
        ['reaction', 'Someone reacts. e.kind is the emoji, e.message_id the message.'],
        ['memberJoin', 'Someone joins a group the bot is in. (Python: member_join.)'],
        ['ready', 'The bot is signed in. You get the same data as bot.me().'],
        ['error', 'Something went wrong. The bot keeps trying, slowing down while a problem lasts.'],
      ]} />
      <h2>What an event contains</h2>
      <Table head={['Field', 'Meaning']} rows={[
        ['type', 'message, edit, reaction or member_join.'],
        ['id / message_id', 'The message this is about.'],
        ['content', 'The message text (messages, edits, reactions).'],
        ['channel_id, channel_name', 'Where it happened.'],
        ['group_id, group_name', 'Which group.'],
        ['user_id, username, display_name, is_bot', 'Who did it. Also available as author_id, author_username, author_name.'],
        ['reply_to', 'The message this one replies to, if any.'],
        ['kind', 'For reactions: the emoji.'],
        ['mentioned', 'True when the bot was mentioned or replied to.'],
        ['at', 'When it happened.'],
      ]} />
      <Both label="Example" js={`bot.on('memberJoin', (e) => bot.send(welcomeChannelId, \`Welcome, @\${e.username}!\`))
bot.on('reaction', (e) => { if (e.kind === '⭐') console.log(e.username, 'starred', e.message_id) })`} py={`@bot.on('member_join')
def joined(e):
    bot.send(WELCOME_CHANNEL_ID, 'Welcome, @%s!' % e.username)

@bot.on('reaction')
def reacted(e):
    if e.kind == '⭐':
        print(e.username, 'starred', e.message_id)`} />
    </>
  )
}

function Messages() {
  return (
    <>
      <h1>Messages and style</h1>
      <h2>Text</h2>
      <p>Bots write the same markdown people do: <code>**bold**</code>, <code>*italic*</code>, <code>~~strike~~</code>, <code>__underline__</code>, <code>||spoiler||</code>, <code>`code`</code>, fenced code blocks, <code>&gt; quotes</code>, lists, headings and <code>[links](https://...)</code>. Mention people with <code>@username</code>. A message can be 2000 characters.</p>
      <h2>Embeds (rich cards)</h2>
      <Both js={`await bot.embed(channelId, {
  title: 'Server status',
  description: 'All systems **normal**.',
  color: '#3ba55d',
  thumbnail: 'https://example.com/logo.png',
  image: 'https://example.com/chart.png',
  footer: 'Updated just now',
  url: 'https://example.com/status',
  fields: [['Players', '12 / 50', true], ['Uptime', '3 days', true], ['Notes', 'Fields marked true sit side by side']],   // up to 6
  author: { name: 'Status bot', icon: 'https://example.com/me.png' },
  footerIcon: 'https://example.com/logo.png',
  timestamp: true,                                             // shows the time
})`} py={`bot.embed(channel_id, {
    'title': 'Server status',
    'description': 'All systems **normal**.',
    'color': '#3ba55d',
    'thumbnail': 'https://example.com/logo.png',
    'image': 'https://example.com/chart.png',
    'footer': 'Updated just now',
    'url': 'https://example.com/status',
    'fields': [['Players', '12 / 50', True], ['Uptime', '3 days', True], ['Notes', 'Fields marked True sit side by side']],   # up to 6
    'author': {'name': 'Status bot', 'icon': 'https://example.com/me.png'},
    'footer_icon': 'https://example.com/logo.png',
    'timestamp': True,                                          # shows the time
})`} />
      <p>Put text above the card with <code>bot.send(channelId, {'{'} content: 'Hi!', embed: {'{'} ... {'}'} {'}'})</code>. Pictures must be https links.</p>
      <h2>Polls</h2>
      <Both js={`const id = await bot.poll(channelId, 'Which map next?', ['Desert', 'Forest', 'Snow'])
// later:
const votes = await bot.pollResults(id)      // [{ opt: 0, votes: 4 }, ...]`} py={`msg_id = bot.poll(channel_id, 'Which map next?', ['Desert', 'Forest', 'Snow'])
# later:
votes = bot.poll_results(msg_id)             # [{'opt': 0, 'votes': 4}, ...]`} />
      <h2>Replies, reactions, edits</h2>
      <Both js={`bot.on('mention', async (m) => {
  await m.react('👀')
  const sent = await m.reply('Thinking...')
  await bot.edit(sent, 'Done! ✅')
})`} py={`@bot.on('mention')
def mentioned(m):
    m.react('👀')
    sent = m.reply('Thinking...')
    bot.edit(sent, 'Done! ✅')`} />
      <h2>Commands</h2>
      <Both js={`bot.command('add', (m, args) => m.reply(String(Number(args[0]) + Number(args[1]))), {
  description: 'Add two numbers: !add 2 3',
  cooldown: 5,
})`} py={`@bot.command('add', description='Add two numbers: !add 2 3', cooldown=5)
def add(m, args):
    m.reply(str(float(args[0]) + float(args[1])))`} />
    </>
  )
}

function Permissions() {
  return (
    <>
      <h1>Permissions</h1>
      <p className="lead">Every bot can read and talk in the groups it joins. Anything stronger is a permission, and <strong>you choose a bot's default permissions when you create it</strong>.</p>
      <h2>Default permissions</h2>
      <p>In the Developer portal, each bot has a set of default permissions. When a group founder adds the bot with its add code, the bot joins with exactly those permissions, so there is nothing to tick afterwards.</p>
      <Table head={['Preset', 'Permissions', 'Good for']} rows={PRESETS.map(([, name, perms, d]) => [name, perms.length ? perms.join(', ') : 'none', d])} />
      <ul>
        <li>The <strong>founder</strong> can give a bot all of its default permissions.</li>
        <li>Anyone else who adds a bot can only hand over permissions they have themselves.</li>
        <li>The founder can change a bot's permissions at any time in <strong>Group settings &rarr; Members</strong>. Defaults only apply when the bot joins.</li>
        <li>You see the defaults before you add a bot, in the preview.</li>
      </ul>
      <h2>What each permission allows</h2>
      <Table head={['Permission', 'What the bot can do']} rows={PERMS} />
      <p>Moderation actions done by a bot show in the group's audit log under the bot's name, exactly like a person's. The founder can never be removed or timed out by a bot.</p>
      <Note kind="warn" title="Think before you grant">A bot with the members permission can remove people. Only give powers to bots you wrote or trust, and keep their keys private.</Note>
      <p>Adding a bot to a group needs the <strong>Manage members</strong> permission, and a group can hold up to 10 bots.</p>
    </>
  )
}

function Storage() {
  return (
    <>
      <h1>Remembering things</h1>
      <p className="lead">Nook does not store anything for your bot. When the bot stops, everything in its memory is gone. If it needs to remember scores, settings or who did what, give it its own database. The two common choices are SQLite and MySQL.</p>
      <h2>SQLite: a file next to your bot</h2>
      <p>The easiest choice. There is nothing to install or run: the database is one file (for example <code>bot.db</code>) in your bot folder. Python includes it; for Node.js add the <code>better-sqlite3</code> package (the "Points and leaderboard" starter already does this).</p>
      <Both label="SQLite" js={`import Database from 'better-sqlite3'      // npm install better-sqlite3

const db = new Database('bot.db')
db.exec('CREATE TABLE IF NOT EXISTS scores (user TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0)')

bot.slash('win', { description: 'Give yourself a point' }, (i) => {
  db.prepare('INSERT INTO scores (user, points) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET points = points + 1').run(i.username)
  const { points } = db.prepare('SELECT points FROM scores WHERE user = ?').get(i.username)
  return i.reply('You now have ' + points + ' points')
})`} py={`import sqlite3, threading

db = sqlite3.connect('bot.db', check_same_thread=False)
lock = threading.Lock()                    # commands run on several threads, so take turns
db.execute('CREATE TABLE IF NOT EXISTS scores (user TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0)')

@bot.slash('win', description='Give yourself a point')
def win(i):
    with lock:
        db.execute('INSERT INTO scores (user, points) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET points = points + 1', (i.username,))
        db.commit()
        points = db.execute('SELECT points FROM scores WHERE user = ?', (i.username,)).fetchone()[0]
    i.reply('You now have %d points' % points)`} />
      <h2>MySQL: a database server</h2>
      <p>Better when several bots share data, or the bot runs on a server that already has MySQL (or MariaDB). Create a database and a user, then put the details in <code>.env</code>:</p>
      <Code label=".env">{`MYSQL_HOST=localhost
MYSQL_USER=botuser
MYSQL_PASSWORD=choose-a-password
MYSQL_DATABASE=mybot`}</Code>
      <Both label="MySQL" js={`import mysql from 'mysql2/promise'          // npm install mysql2

const pool = mysql.createPool({ host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
await pool.query('CREATE TABLE IF NOT EXISTS scores (user VARCHAR(40) PRIMARY KEY, points INT NOT NULL DEFAULT 0)')

bot.slash('win', { description: 'Give yourself a point' }, async (i) => {
  await pool.query('INSERT INTO scores (user, points) VALUES (?, 1) ON DUPLICATE KEY UPDATE points = points + 1', [i.username])
  const [[row]] = await pool.query('SELECT points FROM scores WHERE user = ?', [i.username])
  return i.reply('You now have ' + row.points + ' points')
})`} py={`import os
import mysql.connector                     # pip install mysql-connector-python

def connect():
    return mysql.connector.connect(host=os.environ['MYSQL_HOST'], user=os.environ['MYSQL_USER'], password=os.environ['MYSQL_PASSWORD'], database=os.environ['MYSQL_DATABASE'])

with connect() as c:
    c.cursor().execute('CREATE TABLE IF NOT EXISTS scores (user VARCHAR(40) PRIMARY KEY, points INT NOT NULL DEFAULT 0)')

@bot.slash('win', description='Give yourself a point')
def win(i):
    with connect() as c:                   # a fresh connection per command keeps threads safe
        cur = c.cursor()
        cur.execute('INSERT INTO scores (user, points) VALUES (%s, 1) ON DUPLICATE KEY UPDATE points = points + 1', (i.username,))
        c.commit()
        cur.execute('SELECT points FROM scores WHERE user = %s', (i.username,))
        points = cur.fetchone()[0]
    i.reply('You now have %d points' % points)`} />
      <Note title="Good habits">Always pass values as parameters (the <code>?</code> and <code>%s</code> above), never glue text into the SQL yourself. Back the database file or server up now and then. Keep passwords in <code>.env</code>, not in the code.</Note>
    </>
  )
}

function Limits() {
  return (
    <>
      <h1>Limits and safety</h1>
      <h2>Rate limits</h2>
      <p>Each limit is per bot, per minute. Go over and the call fails with a clear message; try again shortly. The library slows itself down when that happens.</p>
      <Table head={['Action', 'Per minute']} rows={[['Checking for events', '240'], ['Sending, editing, deleting, reacting', '60 each'], ['Reading (history, members, search, audit, me, storage)', '120'], ['Pin, kick, timeout, purge, channels, group changes', '30'], ['Changing status', '20']]} />
      <h2>Other limits</h2>
      <Table head={['What', 'Limit']} rows={[['Message length', '2000 characters'], ['Bots per person', '10'], ['Bots per group', '10'], ['Embed fields', '6'], ['Poll options', '2 to 6']]} />
      <h2>Keeping the token safe</h2>
      <ul>
        <li>The token is the bot's password. Anyone holding it can act as the bot.</li>
        <li>Keep it in the <code>.env</code> file. Never commit that file to GitHub or post it in chat.</li>
        <li>The connect key contains the token. If it leaks, open the Developer portal and press <strong>New key</strong>. The old one stops working at once.</li>
        <li>Nook stores only a fingerprint of the token, so it cannot show it to you again.</li>
        <li>Bots cannot be messaged directly, and they cannot read private conversations.</li>
      </ul>
      <Note title="Be a good neighbour">Do not use bots to spam, scrape, harass or avoid bans. Accounts that do can be removed.</Note>
    </>
  )
}

function Help() {
  const items = [
    ['"Invalid bot token"', 'The key is wrong or was replaced. Copy the newest connect key from the portal.'],
    ['"The bot is not in that channel\'s group"', 'Add the bot to the group with its add code.'],
    ['"The bot needs the ... permission"', 'The founder must tick that permission for the bot in Group settings, Members. (Or set better default permissions on the bot in the portal before adding it.)'],
    ['"That is not a Nook connect key"', 'Copy the whole key from the Developer portal. It starts with nkc_.'],
    ['"Rate limit reached"', 'You are sending too fast. Wait a moment, or slow the loop.'],
    ['Nothing happens when I type a command', 'Is the bot running? Is it in this group? Does the command start with the prefix (default !)? Watch the terminal for "Problem:" lines.'],
    ['Only messages arrive, not edits or reactions', 'Run the latest database updates (update_v25.sql and update_v26.sql). The library falls back to messages only until then.'],
    ['"Could not find the function"', 'The database is missing an update. Run the newest SQL file from your download.'],
    ['It stops when I close the window', 'Use Task Scheduler or pm2. See "Running your bot".'],
    ['My bot forgot everything after a restart', 'Nook keeps nothing for bots. Store what you need in your own SQLite or MySQL database. See "Remembering things".'],
    ['"No module named nook_bot" or "Cannot find package nook-bot"', 'The library is not installed yet. Double-click start.bat, or run pip install / npm install as shown in Quick start.'],
    ['"NookBot needs a connect key"', 'Put NOOK_KEY=nkc_... in a file called .env in the same folder as your bot.'],
  ]
  return (
    <>
      <h1>Troubleshooting</h1>
      <div className="docs-faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </>
  )
}

const VIEWS = { overview: Overview, start: Start, starter: Starter, ai: Ai, run: Run, slash: Slash, interactive: Interactive, library: Library, events: Events, messages: Messages, permissions: Permissions, storage: Storage, python: Python, limits: Limits, help: Help }

export default function DevDocs({ standalone = false }) {
  const read = () => { const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, ''); return VIEWS[h] ? h : 'overview' }
  const [page, setPage] = useState(read)
  useEffect(() => {
    const on = () => setPage(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (id) => { if (standalone) location.hash = id; else setPage(id); document.querySelector('.docs-body')?.scrollTo?.(0, 0); window.scrollTo?.(0, 0) }
  const View = VIEWS[page]
  const idx = ORDER.findIndex(([id]) => id === page)
  const prev = ORDER[idx - 1]
  const next = ORDER[idx + 1]
  const title = useMemo(() => ORDER[idx]?.[1], [idx])
  useEffect(() => { if (standalone && title) document.title = `${title} · Nook bots` }, [title, standalone])
  return (
    <div className={`docs ${standalone ? 'standalone' : ''}`} role={standalone ? 'main' : undefined}>
      <nav className="docs-toc" aria-label="Documentation">
        <strong className="docs-brand">Nook bots</strong>
        {PAGES.map(([group, items]) => (
          <div key={group} className="docs-group">
            <span className="docs-group-title">{group}</span>
            {items.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined} className={page === id ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(id) }}>{label}</a>)}
          </div>
        ))}
        {standalone && <a href="/" className="docs-back"><Icon name="chevron" size={12} /> Back to Nook</a>}
      </nav>
      <article className="docs-body">
        <View go={go} />
        <footer className="docs-pager">
          {prev ? <button className="ghost" onClick={() => go(prev[0])}>&larr; {prev[1]}</button> : <span />}
          {next && <button className="ghost" onClick={() => go(next[0])}>{next[1]} &rarr;</button>}
        </footer>
      </article>
    </div>
  )
}
