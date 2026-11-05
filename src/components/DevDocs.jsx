import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { API, PERMS, PRESETS, LIB, TEMPLATES, aiPrompt, buildStarter, START_BAT, download } from '../botDocs.js'

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
const Note = ({ kind = 'tip', title, children }) => <div className={`doc-note ${kind}`}><strong>{title || (kind === 'warn' ? 'Careful' : 'Tip')}</strong><div>{children}</div></div>
const Table = ({ head, rows }) => (
  <div className="docs-table-wrap"><table className="docs-table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{j === 0 ? <code>{c}</code> : c}</td>)}</tr>)}</tbody></table></div>
)
const Steps = ({ children }) => <ol className="doc-steps">{children}</ol>

const PAGES = [
  ['Get started', [['overview', 'Welcome'], ['start', 'Quick start'], ['starter', 'Starter bots'], ['ai', 'Build with AI'], ['run', 'Running your bot']]],
  ['Build', [['library', 'The library'], ['events', 'Events'], ['messages', 'Messages and style'], ['permissions', 'Permissions'], ['storage', 'Storing data']]],
  ['Reference', [['api', 'Raw API'], ['limits', 'Limits and safety'], ['help', 'Troubleshooting']]],
]
const ORDER = PAGES.flatMap(([, items]) => items)

function Overview({ go }) {
  const cards = [
    ['Talk', 'Reply to commands and mentions, post embeds and polls, react, pin.'],
    ['Look', 'Read history, list members and channels, see polls and reactions.'],
    ['Moderate', 'Kick, time out, delete messages and manage channels, only where you grant it.'],
    ['Remember', 'Save scores, settings and anything else with built-in storage.'],
    ['Show status', '"Playing Chess" next to the bot\'s name.'],
    ['React to news', 'Edits, reactions and people joining arrive as events.'],
  ]
  return (
    <>
      <h1>Build a Nook bot</h1>
      <p className="lead">A bot is a small program that joins your groups, listens, and acts. Run it on your own computer, a Raspberry Pi or a server. It only makes outgoing connections, so there is nothing to open on your router and no web address to set up.</p>
      <div className="doc-cards">{cards.map(([t, d]) => <div key={t} className="doc-card"><strong>{t}</strong><span>{d}</span></div>)}</div>
      <h2>How it works</h2>
      <div className="doc-flow" aria-label="How a bot talks to Nook">
        <div><strong>Your bot</strong><span>runs anywhere</span></div>
        <span className="doc-arrow" aria-hidden="true">asks "anything new?" every moment <b>&rarr;</b></span>
        <div><strong>Nook</strong><span>answers over HTTPS</span></div>
      </div>
      <p>Your bot signs in with a secret <strong>token</strong>. It asks Nook for news a little over once a second, and sends actions (a reply, a kick) the same way. The <code>nook-bot.mjs</code> library hides all of that, so a working bot is about ten lines.</p>
      <p className="docs-actions"><button className="primary" onClick={() => go('start')}>Make your first bot</button> <button className="ghost" onClick={() => go('library')}>Browse the library</button></p>
    </>
  )
}

function Start() {
  return (
    <>
      <h1>Quick start</h1>
      <p className="lead">About three minutes. You do not type any addresses or keys: the portal gives you one <strong>connect key</strong> and that is all your bot needs.</p>
      <Steps>
        <li><strong>Create the bot.</strong> Press the <code>&lt;/&gt;</code> button at the top of Nook to open the Developer portal, then <strong>Create a bot</strong>. Choose what it is allowed to do (you can change this later).</li>
        <li><strong>Download a starter.</strong> Pick one of the starter bots and press <strong>Download</strong>. You get <code>mybot.mjs</code> and <code>start.bat</code>, with your key already inside. See <a href="#starter">Starter bots</a>.</li>
        <li><strong>Add it to a group.</strong> In your group open <strong>Group settings &rarr; Members</strong>, paste the bot's <strong>add code</strong> and press <strong>Add to group</strong>. It joins with the permissions you chose.</li>
        <li><strong>Run it.</strong> Install <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (version 18 or newer) once, then double-click <code>start.bat</code>.</li>
      </Steps>
      <p>Type <code>!ping</code> in your group and the bot answers. <code>!help</code> lists every command that has a description.</p>
      <h2>Prefer to write it yourself?</h2>
      <p>Get the library, then make a file that uses the connect key from the portal:</p>
      <Code label="Terminal">{`curl -o nook-bot.mjs ${SITE}/sdk/nook-bot.mjs`}</Code>
      <Code label="bot.mjs">{`import { NookBot } from './nook-bot.mjs'

const bot = new NookBot({ key: process.env.NOOK_KEY })   // or paste 'nkc_...' while testing

bot.on('ready', (me) => console.log('Online as', me.name))
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check I am awake' })
bot.start()`}</Code>
      <Code label="Windows (PowerShell)">{`$env:NOOK_KEY = "nkc_..."; node bot.mjs`}</Code>
      <Note title="Want an AI to write it?">Open <a href="#ai">Build with AI</a>, describe your bot, and paste the ready-made brief into ChatGPT, Claude or Gemini.</Note>
      <Note kind="warn" title="The key is a password">The connect key contains your bot's token. Do not post it or upload it. If it leaks, press <strong>New key</strong> on the bot's card.</Note>
    </>
  )
}

function Starter() {
  const [busy, setBusy] = useState('')
  const get = async (id) => {
    setBusy(id)
    try { download('mybot.mjs', await buildStarter(id, null)); download('start.bat', START_BAT) } finally { setBusy('') }
  }
  return (
    <>
      <h1>Starter bots</h1>
      <p className="lead">Ready-made bots you can run without writing any code. Pick one, edit the few lines marked "edit me", and you are done.</p>
      <p>The easiest way is in the <strong>Developer portal</strong>: each bot has a <strong>Download starter</strong> button that puts your connect key inside the file for you. The buttons below download the same files with a placeholder for the key.</p>
      <div className="doc-cards">
        {TEMPLATES.map(([id, name, desc]) => (
          <div key={id} className="doc-card"><strong>{name}</strong><span>{desc}</span><button className="ghost small" disabled={!!busy} onClick={() => get(id)}>{busy === id ? 'Preparing…' : 'Download'}</button></div>
        ))}
      </div>
      <h2>Using a starter</h2>
      <Steps>
        <li>Put <code>mybot.mjs</code> and <code>start.bat</code> in one folder.</li>
        <li>If the key is not inside yet, open <code>mybot.mjs</code> in Notepad and replace <code>PASTE-YOUR-CONNECT-KEY</code> with your key.</li>
        <li>Double-click <code>start.bat</code>. It checks that Node.js is installed, starts the bot, and starts it again if it ever stops.</li>
      </Steps>
      <Note title="It is a single file">The starter already contains the library, so there is nothing else to download or install.</Note>
    </>
  )
}

function Ai() {
  const [wish, setWish] = useState('')
  const [done, setDone] = useState(false)
  const text = aiPrompt(wish)
  const copyIt = () => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) })
  return (
    <>
      <h1>Build with AI</h1>
      <p className="lead">You do not have to be a programmer. Tell an AI what you want, and it writes the bot for you. Works with ChatGPT, Claude, Gemini, Copilot and others.</p>
      <Steps>
        <li><strong>Describe your bot</strong> in the box below, in plain words.</li>
        <li><strong>Copy the brief</strong> and paste it into your AI chat. It explains Nook's bot library to the AI, so the code it writes just works.</li>
        <li><strong>Save the answer</strong> as <code>bot.mjs</code>, next to <code>nook-bot.mjs</code> (download it from the portal's <strong>Download starter</strong>, or from <code>{SITE}/sdk/nook-bot.mjs</code>).</li>
        <li><strong>Run it</strong> with <code>node bot.mjs</code> after setting <code>NOOK_KEY</code> to your connect key. See <a href="#run">Running your bot</a>.</li>
      </Steps>
      <label className="doc-field">What should your bot do?
        <textarea rows={4} value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Example: answer questions with ChatGPT when someone types !ask, and welcome new members in #general" />
      </label>
      <p className="docs-actions">
        <button className="primary" onClick={copyIt}>{done ? 'Copied' : 'Copy the brief for my AI'}</button>
        <button className="ghost" onClick={() => download('nook-bot-brief.txt', text)}>Download as a file</button>
      </p>
      <details className="doc-details"><summary>See the brief</summary><pre tabIndex={0} className="doc-pre">{text}</pre></details>
      <h2>Using ChatGPT or another AI service inside your bot</h2>
      <p>There are two different things, and it helps to keep them apart:</p>
      <ul>
        <li><strong>An AI helping you write the bot</strong> (above). Free in the ChatGPT or Claude apps. Nothing else needed.</li>
        <li><strong>An AI answering inside your group</strong> (a chat bot that replies with ChatGPT). The bot calls the AI company's service, which needs an <strong>API key</strong> from them (usually pay-as-you-go, a few cents for lots of messages). The "AI chat bot" starter does this for you.</li>
      </ul>
      <Steps>
        <li>Make an API key on your AI provider's site (for example platform.openai.com).</li>
        <li>Set it on your PC once: <code>setx OPENAI_API_KEY "sk-..."</code> and open a new window. It stays on your computer, never inside the bot file.</li>
        <li>Run the "AI chat bot" starter, or ask your AI to change it to another provider.</li>
      </Steps>
      <Note kind="warn" title="Keep keys private">Never paste an API key or connect key into a chat with an AI, or into a file you share. Leave the placeholder in the code and set the real key on your own computer.</Note>
    </>
  )
}

function Run() {
  return (
    <>
      <h1>Running your bot</h1>
      <p className="lead">A bot only needs to be running to answer. While it is off, it simply misses things.</p>
      <h2>On your own Windows PC</h2>
      <Steps>
        <li>Put <code>bot.mjs</code> and <code>nook-bot.mjs</code> in a folder, for example <code>C:\bots\mybot</code>.</li>
        <li>Open PowerShell in that folder and run <code>node bot.mjs</code>. Close the window and the bot stops.</li>
        <li>To start it with Windows, open <strong>Task Scheduler &rarr; Create Basic Task</strong>, trigger <em>When I log on</em>, action <em>Start a program</em>: program <code>node</code>, arguments <code>bot.mjs</code>, start in <code>C:\bots\mybot</code>.</li>
      </Steps>
      <Note kind="warn" title="Where to keep the key">Do not paste the connect key into a file you share or upload. Set it as an environment variable (<code>setx NOOK_KEY "nkc_..."</code> on Windows, then open a new window) and the library picks it up by itself.</Note>
      <h2>Keep it running</h2>
      <Code label="pm2 restarts it if it crashes (Windows, macOS, Linux)">{`npm install -g pm2
pm2 start bot.mjs --name mybot
pm2 save`}</Code>
      <h2>Other places</h2>
      <Table head={['Where', 'Good for']} rows={[
        ['Your PC', 'Free, fine while your PC is on.'],
        ['Raspberry Pi', 'Always on and tiny. Same steps as Linux.'],
        ['A small server (VPS)', 'Always on, about the price of a coffee a month. Use pm2 or a systemd service.'],
        ['Free hosts (Railway, Fly.io, Render workers)', 'Any host that can run a Node program in the background.'],
      ]} />
      <p>The bot never needs to be reachable from the internet, so a firewall or home router is not a problem.</p>
    </>
  )
}

function Library() {
  return (
    <>
      <h1>The library</h1>
      <p className="lead">Everything in <code>nook-bot.mjs</code>. Methods return promises, so use <code>await</code>.</p>
      {LIB.map(([group, rows]) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="docs-table-wrap"><table className="docs-table"><tbody>{rows.map(([sig, d]) => <tr key={sig}><td><code>{sig}</code></td><td>{d}</td></tr>)}</tbody></table></div>
        </section>
      ))}
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
        ['memberJoin', 'Someone joins a group the bot is in.'],
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
      <Code label="Example">{`bot.on('memberJoin', (e) => bot.send(welcomeChannelId, \`Welcome, @\${e.username}!\`))
bot.on('reaction', (e) => { if (e.kind === '⭐') console.log(e.username, 'starred', e.message_id) })`}</Code>
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
      <Code>{`await bot.embed(channelId, {
  title: 'Server status',
  description: 'All systems **normal**.',
  color: '#3ba55d',
  thumbnail: 'https://example.com/logo.png',
  image: 'https://example.com/chart.png',
  footer: 'Updated just now',
  url: 'https://example.com/status',
  fields: [['Players', '12 / 50'], ['Uptime', '3 days']],   // up to 4
})`}</Code>
      <h2>Polls</h2>
      <Code>{`const id = await bot.poll(channelId, 'Which map next?', ['Desert', 'Forest', 'Snow'])
// later:
const votes = await bot.pollResults(id)      // [{ opt: 0, votes: 4 }, ...]`}</Code>
      <h2>Replies, reactions, edits</h2>
      <Code>{`bot.on('mention', async (m) => {
  await m.react('👀')
  const sent = await m.reply('Thinking...')
  await bot.edit(sent, 'Done! ✅')
})`}</Code>
      <h2>Commands</h2>
      <Code>{`bot.command('add', (m, args) => m.reply(String(Number(args[0]) + Number(args[1]))), {
  description: 'Add two numbers: !add 2 3',
  cooldown: 5,
})`}</Code>
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
      <h1>Storing data</h1>
      <p className="lead">Every bot has a small private key-value store, so it can remember things between restarts without a database of your own.</p>
      <Code>{`await bot.kv.set('score:sam', { points: 12 })
const sam = await bot.kv.get('score:sam')          // { points: 12 }
const all = await bot.kv.list('score:')             // [{ key, value }, ...]
await bot.kv.delete('score:sam')`}</Code>
      <Table head={['Limit', 'Value']} rows={[['Keys per bot', '500'], ['Key length', '80 characters'], ['Value size', '8000 characters of JSON']]} />
      <p>Only your bot can read its store. If you delete the bot, its data goes with it.</p>
    </>
  )
}

function Api() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const low = q.trim().toLowerCase()
  return (
    <>
      <h1>Raw API</h1>
      <p className="lead">The library is a thin wrapper. From any language you can call these functions yourself.</p>
      <Code label="Every call is a POST like this">{`curl -X POST ${URL_}/rest/v1/rpc/bot_send \\
  -H "apikey: ${KEY_}" \\
  -H "Authorization: Bearer ${KEY_}" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"nk_...","channel":"CHANNEL-ID","content":"Hello!"}'`}</Code>
      <p>The key above is the public <em>anon</em> key. The bot's own <code>token</code> in the body is what proves who it is. Errors come back as a JSON <code>message</code>.</p>
      <div className="docs-search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search functions" aria-label="Search functions" /></div>
      {API.map(([group, fns]) => {
        const rows = fns.filter(([n, , d]) => !low || n.includes(low) || d.toLowerCase().includes(low))
        if (!rows.length) return null
        return (
          <section key={group}>
            <h2>{group}</h2>
            {rows.map(([name, params, desc, perm]) => (
              <div key={name} className="api-fn">
                <button type="button" className="api-head" aria-expanded={open === name} onClick={() => setOpen(open === name ? null : name)}>
                  <code>{name}</code>{perm && <span className="api-perm">needs {perm}</span>}<span className="api-desc ellipsis">{desc}</span><Icon name="chevron" size={13} />
                </button>
                {open === name && (
                  <div className="api-body">
                    <p>{desc}</p>
                    <p><strong>Body:</strong> <code>{`{ ${params.split(', ').map((p) => (p.endsWith('?') ? `"${p.slice(0, -1)}"?` : `"${p}"`)).join(', ')} }`}</code></p>
                    {perm && <p><strong>Permission:</strong> the bot needs <code>{perm}</code> in that group.</p>}
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}
      <h2>Python</h2>
      <p>See <code>python-bot.py</code> in the download. It is the same loop in about twenty lines with <code>requests</code>.</p>
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
      <Table head={['What', 'Limit']} rows={[['Message length', '2000 characters'], ['Bots per person', '10'], ['Bots per group', '10'], ['Embed fields', '4'], ['Poll options', '2 to 6']]} />
      <h2>Keeping the token safe</h2>
      <ul>
        <li>The token is the bot's password. Anyone holding it can act as the bot.</li>
        <li>Keep it in an environment variable. Never commit it to GitHub or post it in chat.</li>
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
  ]
  return (
    <>
      <h1>Troubleshooting</h1>
      <div className="docs-faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </>
  )
}

const VIEWS = { overview: Overview, start: Start, starter: Starter, ai: Ai, run: Run, library: Library, events: Events, messages: Messages, permissions: Permissions, storage: Storage, api: Api, limits: Limits, help: Help }

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
