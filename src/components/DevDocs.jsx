import { useState } from 'react'
import Icon from './Icon.jsx'

const URL_ = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co'
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR-ANON-KEY'

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

const SECTIONS = [
  ['start', 'Quick start'],
  ['create', 'Create a bot'],
  ['add', 'Add it to a group'],
  ['run', 'Run it on your own PC'],
  ['sdk', 'The nook-bot library'],
  ['api', 'API reference'],
  ['format', 'Formatting, embeds and polls'],
  ['limits', 'Rules and limits'],
  ['security', 'Keeping your token safe'],
  ['hosting', 'Where to run it'],
  ['trouble', 'Troubleshooting'],
]

export default function DevDocs({ standalone = false }) {
  return (
    <div className={`docs ${standalone ? 'standalone' : ''}`} role={standalone ? 'main' : undefined}>
      <nav className="docs-toc" aria-label="Documentation sections">
        <strong>Nook bots</strong>
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{label}</a>)}
        {standalone && <a href="/" className="docs-back"><Icon name="chevron" size={12} /> Back to Nook</a>}
      </nav>
      <article className="docs-body">
        <h1>Build a Nook bot</h1>
        <p className="lead">A bot is a small program that joins your groups, reads messages and replies. It can run on your own computer, a Raspberry Pi or a server. It only ever makes outgoing connections, so you do not need to open ports or set up a web address.</p>

        <h2 id="start">Quick start</h2>
        <ol>
          <li>Open the <strong>Developer portal</strong> (the <code>&lt;/&gt;</code> button next to your name) and press <strong>Create a bot</strong>. Copy the <strong>token</strong> it shows you. It is only shown once.</li>
          <li>In your group, open <strong>Group settings &gt; Members &gt; Add a bot</strong> and paste the bot's <strong>add code</strong> (shown on the bot's card).</li>
          <li>Install <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (version 18 or newer), then save the library and the example next to each other:</li>
        </ol>
        <Code label="Download the library">{`# download nook-bot.mjs from this site
curl -o nook-bot.mjs ${typeof location !== 'undefined' ? location.origin : 'https://YOUR-SITE'}/sdk/nook-bot.mjs`}</Code>
        <Code label="bot.mjs">{`import { NookBot } from './nook-bot.mjs'

const bot = new NookBot({
  url: '${URL_}',
  anonKey: '${KEY_}',
  token: 'nk_PASTE_YOUR_TOKEN_HERE',
})

bot.on('ready', (me) => console.log('Online as', me.name))
bot.command('ping', (m) => bot.send(m.channel_id, 'pong!', { reply: m.id }))
bot.start()`}</Code>
        <Code label="Run it">{`node bot.mjs`}</Code>
        <p>Now type <code>!ping</code> in a channel of the group. Your bot answers. Close the window and it goes quiet, start it again and it is back.</p>

        <h2 id="create">Create a bot</h2>
        <p>In the Developer portal choose <strong>Create a bot</strong> and pick a <strong>username</strong> (3 to 20 letters, numbers or underscores, shared with people, so people can <code>@mention</code> it), a display name and a short description. You can have up to 10 bots. On each bot's card you can change its picture, name and description, copy its <strong>add code</strong>, make a <strong>new token</strong> (the old one stops working immediately) or delete the bot.</p>

        <h2 id="add">Add it to a group</h2>
        <p>Anyone with the <strong>members</strong> permission in a group (the founder always has it) can add a bot: <strong>Group settings &gt; Members &gt; Add a bot</strong>, paste the add code, check the preview and confirm. The bot shows in the member list with a <span className="bot-tag">BOT</span> tag. To remove it, remove it like any member. A group can have up to 10 bots. If you ever want to stop people adding your bot, make a new add code in the portal.</p>
        <p>Bots work in <strong>group channels</strong>. They cannot be messaged directly and cannot join voice calls.</p>

        <h2 id="run">Run it on your own PC</h2>
        <p>Your bot is just a program, so it can live on any computer that has internet. The bot asks Nook for new messages about every 1.5 seconds and sends replies the same way. Nothing connects <em>in</em> to your computer.</p>
        <ul>
          <li><strong>Keeping it running on Windows:</strong> open Task Scheduler, create a task that runs at log on with the action <code>node C:\bots\bot.mjs</code> (start in <code>C:\bots</code>), or put a shortcut to a <code>.bat</code> file containing that command in <code>shell:startup</code>.</li>
          <li><strong>Restart on crash:</strong> <code>npm install -g pm2</code>, then <code>pm2 start bot.mjs</code> and <code>pm2 save</code>.</li>
          <li><strong>When your PC sleeps or is off</strong> the bot is offline. Messages sent meanwhile are not replayed when it starts again (it begins from "now").</li>
          <li><strong>Keep the token out of your code</strong> by reading it from an environment variable: <code>token: process.env.NOOK_TOKEN</code>, then run <code>set NOOK_TOKEN=nk_...</code> (Windows) or <code>export NOOK_TOKEN=nk_...</code> (Mac/Linux) first.</li>
          <li>Any language works: see the Python example below and the raw API reference.</li>
        </ul>
        <Code label="python-bot.py (pip install requests)">{`import time, requests
URL = "${URL_}"
ANON_KEY = "${KEY_}"
TOKEN = "nk_PASTE_YOUR_TOKEN_HERE"

def rpc(name, body):
    r = requests.post(f"{URL}/rest/v1/rpc/{name}", json=body,
                      headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}, timeout=15)
    if not r.ok: raise RuntimeError(r.json().get("message", r.text))
    return r.json() if r.text else None

cursor = rpc("bot_me", {"token": TOKEN})["now"]
while True:
    for m in rpc("bot_events", {"token": TOKEN, "after": cursor, "lim": 100}):
        cursor = m["created_at"]
        if m["content"].strip() == "!ping":
            rpc("bot_send", {"token": TOKEN, "channel": m["channel_id"], "content": "pong!", "reply": m["id"]})
    time.sleep(1.5)`}</Code>

        <h2 id="sdk">The nook-bot library</h2>
        <table className="docs-table"><tbody>
          <tr><th>new NookBot({'{ url, anonKey, token, prefix = "!", interval = 1500 }'})</th><td>Make a bot. <code>prefix</code> is what commands start with.</td></tr>
          <tr><th>bot.start() / bot.stop()</th><td>Start or stop listening. <code>start()</code> checks the token first and throws if it is wrong.</td></tr>
          <tr><th>bot.on('ready', fn)</th><td>Called once with <code>{'{ id, username, name, groups }'}</code> (each group lists its channels).</td></tr>
          <tr><th>bot.on('message', fn)</th><td>Every new message in the bot's groups (not its own).</td></tr>
          <tr><th>bot.on('mention', fn)</th><td>A message that @mentions the bot or replies to one of its messages.</td></tr>
          <tr><th>bot.on('error', fn)</th><td>Network or API problems. The bot waits and retries by itself.</td></tr>
          <tr><th>bot.command(name, fn)</th><td>Runs <code>fn(message, args, text)</code> for messages like <code>!name a b c</code>.</td></tr>
          <tr><th>bot.send(channelId, text, {'{ reply }'})</th><td>Send a message. Returns its id.</td></tr>
          <tr><th>bot.edit(id, text) / bot.delete(id)</th><td>Change or remove one of the bot's own messages.</td></tr>
          <tr><th>bot.react(id, emoji)</th><td>Add a reaction, for example <code>'👍'</code>.</td></tr>
          <tr><th>bot.embed(channelId, {'{ title, description, color, fields }'})</th><td>Send a rich card (see below).</td></tr>
          <tr><th>bot.poll(channelId, question, [options])</th><td>Send a poll with 2 to 6 options.</td></tr>
        </tbody></table>
        <p>A <strong>message</strong> object has: <code>id, channel_id, channel_name, group_id, group_name, author_id, author_username, author_name, author_is_bot, content, reply_to, mentioned, created_at</code>.</p>

        <h2 id="api">API reference</h2>
        <p>The library is a thin wrapper over plain HTTPS calls, so you can use any language. Every call is a <code>POST</code> to <code>{URL_}/rest/v1/rpc/NAME</code> with the headers <code>apikey: YOUR-ANON-KEY</code>, <code>Authorization: Bearer YOUR-ANON-KEY</code> and <code>Content-Type: application/json</code>. The anon key is public. The <strong>bot token</strong> in the body is what proves who the bot is.</p>
        <table className="docs-table"><thead><tr><th>Name</th><th>Body</th><th>Returns</th></tr></thead><tbody>
          <tr><td><code>bot_me</code></td><td><code>token</code></td><td>The bot's id, username, name, server time (<code>now</code>) and its groups with their channels.</td></tr>
          <tr><td><code>bot_events</code></td><td><code>token, after</code> (timestamp), <code>lim</code> (1 to 100)</td><td>Messages newer than <code>after</code> in the bot's groups, oldest first. Pass the last message's <code>created_at</code> as the next <code>after</code>. Start with <code>now</code> from <code>bot_me</code>.</td></tr>
          <tr><td><code>bot_send</code></td><td><code>token, channel</code> (id), <code>content</code>, <code>reply</code> (optional message id)</td><td>The new message id.</td></tr>
          <tr><td><code>bot_edit</code></td><td><code>token, message, content</code></td><td>Nothing. Only the bot's own messages.</td></tr>
          <tr><td><code>bot_delete</code></td><td><code>token, message</code></td><td>Nothing. Only the bot's own messages.</td></tr>
          <tr><td><code>bot_react</code></td><td><code>token, message, kind</code> (an emoji)</td><td>Nothing.</td></tr>
        </tbody></table>
        <Code label="curl example">{`curl -X POST "${URL_}/rest/v1/rpc/bot_send" \\
  -H "apikey: ${KEY_}" -H "Authorization: Bearer ${KEY_}" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"nk_...","channel":"CHANNEL-ID","content":"Hello!"}'`}</Code>
        <p>Errors come back with an HTTP error status and a JSON <code>message</code> such as <code>Invalid bot token</code> or <code>Rate limit reached for send</code>.</p>

        <h2 id="format">Formatting, embeds and polls</h2>
        <p>Bot messages support the same formatting as everyone's: <code>**bold**</code>, <code>*italic*</code>, <code>__underline__</code>, <code>~~strike~~</code>, <code>||spoiler||</code>, <code>`code`</code>, code blocks, quotes, lists, links and <code>@username</code> mentions.</p>
        <p><strong>Embeds</strong> are a message whose text starts with <code>&lt;embed&gt;</code> followed by JSON. The library builds it for you with <code>bot.embed()</code>. Keys: <code>t</code> title, <code>u</code> title link, <code>d</code> description, <code>c</code> colour (<code>#rrggbb</code>), <code>i</code> big image (https), <code>th</code> small image (https), <code>f</code> footer, <code>fl</code> up to 4 fields as <code>[[name, value], ...]</code>. Keep the whole message under 900 characters.</p>
        <p><strong>Polls</strong> start with <code>&lt;poll&gt;</code> followed by <code>{'{"q":"Question","o":["A","B"]}'}</code> (2 to 6 options). People vote by clicking; bots cannot vote.</p>

        <h2 id="limits">Rules and limits</h2>
        <ul>
          <li>Messages are 1 to 2000 characters.</li>
          <li>Per bot, per minute: 60 sends, 60 edits, 60 deletes, 60 reactions, 240 event checks. Going over returns an error for a moment, then it works again.</li>
          <li>Bots obey <strong>read-only channels</strong> and <strong>slowmode</strong>, and must be in the group to see or post in it. They have no special permissions.</li>
          <li>If a group has <strong>rules</strong>, bots do not need to accept them.</li>
          <li>A bot can only edit and delete its own messages. Group managers can delete any message, including a bot's, and can remove the bot.</li>
          <li>Be a good citizen: do not spam, do not collect people's data, and do not pretend to be a person. Nook can remove bots and accounts that break the rules.</li>
        </ul>

        <h2 id="security">Keeping your token safe</h2>
        <ul>
          <li>The token is like a password for the bot. Anyone who has it can post as your bot. It is shown once when you create it and is only stored in a scrambled form (a hash), so Nook cannot show it to you again.</li>
          <li>Never put it in a public GitHub repository, screenshot or Discord message. If it leaks or you lose it, press <strong>New token</strong> in the portal: the old one stops working immediately.</li>
          <li>The <strong>add code</strong> is different: it only lets someone add your bot to a group they manage. Make a new one any time.</li>
        </ul>

        <h2 id="hosting">Where to run it</h2>
        <ul>
          <li><strong>Your own PC:</strong> free, easy, offline when the PC is off.</li>
          <li><strong>A Raspberry Pi or an old laptop:</strong> always on, tiny power use.</li>
          <li><strong>A small server (VPS):</strong> a few dollars a month, always on.</li>
          <li><strong>Free hosts:</strong> any place that can run Node.js or Python for a long time (not "serverless" functions that sleep) works.</li>
        </ul>

        <h2 id="trouble">Troubleshooting</h2>
        <table className="docs-table"><tbody>
          <tr><th>Invalid bot token</th><td>Copy the token again, with no spaces. If you made a new token, the old one no longer works.</td></tr>
          <tr><th>The bot is not in that channel's group</th><td>Add it to the group first (add code), and use a channel id from <code>bot_me</code>.</td></tr>
          <tr><th>Only moderators can post / Slowmode is on</th><td>The channel is read-only or has slowmode. Use another channel or ask a manager.</td></tr>
          <tr><th>Rate limit reached</th><td>Send fewer messages per minute. The library retries reads on its own.</td></tr>
          <tr><th>function ... not found</th><td>The site owner has not run <code>supabase/update_v24.sql</code> yet.</td></tr>
          <tr><th>Nothing happens when I type !ping</th><td>Make sure the bot is running (look for "Online as ..."), it is in that group, and the message starts exactly with the prefix.</td></tr>
        </tbody></table>
      </article>
    </div>
  )
}
