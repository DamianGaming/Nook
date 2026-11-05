import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'

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

// ── the raw API, described once and shown as cards ──
const API = [
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
  ]],
  ['Moderation', [
    ['bot_kick', 'token, gid, member', 'Remove a member. The founder and bots with equal power cannot be removed.', 'members'],
    ['bot_timeout', 'token, gid, member, minutes', 'Stop someone posting for up to 28 days. 0 ends a timeout.', 'members'],
    ['bot_create_channel', 'token, gid, cname, topic?', 'Make a channel (lowercase letters, numbers, dashes). Returns its id.', 'channels'],
    ['bot_delete_channel', 'token, channel', 'Delete a channel (a group keeps at least one).', 'channels'],
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

const PERMS = [
  ['messages', 'Delete other people\'s messages, pin and unpin.'],
  ['members', 'Remove members and time them out.'],
  ['channels', 'Create and delete channels.'],
]

const LIB = [
  ['Setup', [
    ['new NookBot({ url, anonKey, token, prefix = "!", interval = 1500 })', 'Make a bot. The prefix is for commands, the interval is how often it checks for news (milliseconds).'],
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
  ]],
  ['Moderation', [
    ['bot.kick(groupId, userId)', 'Remove someone (needs members).'],
    ['bot.timeout(groupId, userId, minutes)', 'Time someone out, 0 to end it (needs members).'],
    ['bot.createChannel(groupId, name, topic)', 'Needs channels.'],
    ['bot.deleteChannel(channelId)', 'Needs channels.'],
  ]],
  ['The bot itself', [
    ['bot.setStatus(kind, text)', 'playing, listening, watching, streaming, competing or building. bot.setStatus() clears it.'],
    ['bot.kv.get / set / delete / list', 'Built-in storage. See "Storing data".'],
    ['bot.leave(groupId)', 'Leave a group.'],
    ['bot.rpc(name, body)', 'Call any function from the raw API.'],
  ]],
]

const PAGES = [
  ['Get started', [['overview', 'Welcome'], ['start', 'Quick start'], ['run', 'Running your bot']]],
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
      <p className="lead">About five minutes, and the only thing you need installed is Node.js.</p>
      <Steps>
        <li><strong>Create the bot.</strong> Press the <code>&lt;/&gt;</code> button at the top of Nook to open the Developer portal, then <strong>Create a bot</strong>. Copy the <strong>token</strong>. It is shown once, so save it somewhere private.</li>
        <li><strong>Add it to a group.</strong> In your group open <strong>Group settings &rarr; Members</strong>, paste the bot's <strong>add code</strong> (on its card in the portal) and press <strong>Add to group</strong>.</li>
        <li><strong>Install Node.js</strong> version 18 or newer from <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a>.</li>
        <li><strong>Get the library</strong> and make your bot file:</li>
      </Steps>
      <Code label="Terminal">{`curl -o nook-bot.mjs ${SITE}/sdk/nook-bot.mjs`}</Code>
      <Code label="bot.mjs">{`import { NookBot } from './nook-bot.mjs'

const bot = new NookBot({
  url: '${URL_}',
  anonKey: '${KEY_}',
  token: process.env.NOOK_TOKEN,        // or paste 'nk_...' while testing
})

bot.on('ready', (me) => console.log('Online as', me.name))
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check I am awake' })
bot.start()`}</Code>
      <Code label="Terminal">{`# Windows (PowerShell)
$env:NOOK_TOKEN = "nk_..."; node bot.mjs

# macOS / Linux
NOOK_TOKEN=nk_... node bot.mjs`}</Code>
      <p>Type <code>!ping</code> in your group and the bot answers. <code>!help</code> lists every command that has a description.</p>
      <Note title="More examples">The download folder has <code>ping-bot.mjs</code> (dice, polls, embeds), <code>mod-bot.mjs</code> (welcome message, word filter, kick, timeout, stars) and <code>python-bot.py</code>.</Note>
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
      <Note kind="warn" title="Where to keep the token">Do not paste the token into a file you share or upload. Set it as an environment variable (<code>setx NOOK_TOKEN "nk_..."</code> on Windows, then open a new window).</Note>
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
      <p className="lead">A new bot can read and talk in the channels of groups it joins, and nothing more. Anything stronger must be granted by the group's founder.</p>
      <Steps>
        <li>Open <strong>Group settings &rarr; Members</strong>.</li>
        <li>Find the bot in the member list and open its permissions.</li>
        <li>Tick only what it needs, then save.</li>
      </Steps>
      <Table head={['Permission', 'What the bot can do']} rows={PERMS} />
      <p>Moderation actions done by a bot show in the group's audit log under the bot's name, exactly like a person's. The founder can never be removed or timed out by a bot.</p>
      <Note kind="warn" title="Think before you grant">A bot with the members permission can remove people. Only give powers to bots you wrote or trust, and keep their tokens private.</Note>
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
      <Table head={['Action', 'Per minute']} rows={[['Checking for events', '240'], ['Sending, editing, deleting, reacting', '60 each'], ['Reading (history, members, me, storage)', '120'], ['Pin, kick, timeout, channels', '30'], ['Changing status', '20']]} />
      <h2>Other limits</h2>
      <Table head={['What', 'Limit']} rows={[['Message length', '2000 characters'], ['Bots per person', '10'], ['Bots per group', '10'], ['Embed fields', '4'], ['Poll options', '2 to 6']]} />
      <h2>Keeping the token safe</h2>
      <ul>
        <li>The token is the bot's password. Anyone holding it can act as the bot.</li>
        <li>Keep it in an environment variable. Never commit it to GitHub or post it in chat.</li>
        <li>If it leaks, open the Developer portal and press <strong>New token</strong>. The old one stops working at once.</li>
        <li>Nook stores only a fingerprint of the token, so it cannot show it to you again.</li>
        <li>Bots cannot be messaged directly, and they cannot read private conversations.</li>
      </ul>
      <Note title="Be a good neighbour">Do not use bots to spam, scrape, harass or avoid bans. Accounts that do can be removed.</Note>
    </>
  )
}

function Help() {
  const items = [
    ['"Invalid bot token"', 'The token is wrong or was regenerated. Copy the newest one from the portal.'],
    ['"The bot is not in that channel\'s group"', 'Add the bot to the group with its add code.'],
    ['"The bot needs the ... permission"', 'The founder must tick that permission for the bot in Group settings, Members.'],
    ['"Rate limit reached"', 'You are sending too fast. Wait a moment, or slow the loop.'],
    ['Nothing happens when I type a command', 'Is the bot running? Is it in this group? Does the command start with the prefix (default !)? Watch the terminal for "Problem:" lines.'],
    ['Only messages arrive, not edits or reactions', 'Run the latest database update (update_v25.sql). The library falls back to messages only until then.'],
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

const VIEWS = { overview: Overview, start: Start, run: Run, library: Library, events: Events, messages: Messages, permissions: Permissions, storage: Storage, api: Api, limits: Limits, help: Help }

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
