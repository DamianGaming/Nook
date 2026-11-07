// nook-bot (v4): the Node.js library for Nook bots. No dependencies. Needs Node 18 or newer.
// Install:  npm install https://YOUR-SITE/sdk/nook-bot.tgz      Guide: https://YOUR-SITE/developers
//
//   import { NookBot } from 'nook-bot'
//   const bot = new NookBot()                       // reads NOOK_KEY from the environment or from a .env file
//   bot.command('ping', (m) => m.reply('pong!'))
//   bot.start()
//
// Bots keep their own data (SQLite, MySQL, a JSON file...). Nook stores nothing for a bot between restarts.

// A .env file next to your bot (NOOK_KEY=nkc_...) is read automatically. Real environment variables win.
if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    const fs = await import('node:fs')
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch { /* no .env file: fine */ }
}

export class NookBot {
  constructor({ key, url, anonKey, token, prefix = '!', interval = 1500, help = true } = {}) {
    key = key || (typeof process !== 'undefined' && process.env && process.env.NOOK_KEY) || null
    if (key) {
      const d = NookBot.decodeKey(key)
      url = url || d.u; anonKey = anonKey || d.k; token = token || d.t
    }
    if (!url || !anonKey || !token) throw new Error('NookBot needs a connect key. Put  NOOK_KEY=nkc_...  in a file called .env next to your bot (copy the key from the Developer portal).')
    this.url = url.replace(/\/$/, '')
    this.anonKey = anonKey
    this.token = token
    this.prefix = prefix
    this.interval = interval
    this.handlers = {}
    this.commands = new Map()
    this.info = null
    this.running = false
    this.cursor = null
    this.seen = new Set()
    this.legacy = false
    this.cooldowns = new Map()
    this.slashCmds = new Map()   // slash commands: name -> { description, options, fn }
    this.components = []         // button / menu handlers: { match, fn }
    this.icursor = null
    this.iseen = new Set()
    this.noInteractions = false
    if (help) this.command('help', (m) => m.reply(this.helpText()), { description: 'Show this list' })
  }

  // ── events: message, mention, edit, reaction, memberJoin, interaction, ready, error ──
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this }
  // bot.command('roll', handler, { description: 'Roll a die', cooldown: 5 })  (cooldown in seconds, per person)
  command(name, fn, opts = {}) { this.commands.set(name.toLowerCase(), { fn, ...opts }); return this }
  // Slash commands: people type "/" in Nook and see them above the message box.
  //   bot.slash('roll', { description: 'Roll a die', options: [{ name: 'sides', description: 'How many sides', type: 'integer' }] }, (i) => i.reply('You rolled ' + ...))
  // option types: string, integer, number, boolean, user, channel. Add required: true or choices: ['a', 'b'] (or [{ name, value }]).
  slash(name, def, fn) {
    if (typeof def === 'function') { fn = def; def = {} }
    this.slashCmds.set(String(name).toLowerCase().replace(/^\//, ''), { description: def.description || 'No description', options: def.options || [], fn })
    return this
  }
  // Buttons and menus: bot.button('vote:yes', (i) => i.update('Thanks!'))   ('vote:*' matches any id that starts with "vote:", or pass a RegExp)
  button(match, fn) { this.components.push({ match, fn }); return this }
  select(match, fn) { return this.button(match, fn) } // the picked value(s) are in i.values
  // Publish the slash commands. start() does this for you whenever you have used bot.slash().
  registerCommands() {
    const cmds = [...this.slashCmds.entries()].map(([name, c]) => ({
      name, description: String(c.description).slice(0, 100),
      options: (c.options || []).map((o) => ({
        name: o.name, description: String(o.description || o.name).slice(0, 100), type: o.type || 'string', required: !!o.required,
        choices: (o.choices || []).map((x) => (typeof x === 'object' ? { name: String(x.name), value: String(x.value) } : { name: String(x), value: String(x) })),
      })),
    }))
    return this.rpc('bot_register_commands', this._t({ cmds }))
  }
  helpText() {
    const slash = [...this.slashCmds.entries()].map(([n, c]) => `**/${n}**: ${c.description}`)
    const lines = slash.concat([...this.commands.entries()].filter(([, c]) => c.description).map(([n, c]) => `**${this.prefix}${n}**: ${c.description}`))
    return lines.length ? lines.join('\n') : 'No commands yet.'
  }
  _emit(event, ...args) {
    for (const fn of this.handlers[event] || []) Promise.resolve().then(() => fn(...args)).catch((e) => this._emit('error', e))
  }

  // ── raw API ──
  async rpc(name, body) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) {
      const err = new Error((data && data.message) || `HTTP ${res.status}`)
      err.status = res.status
      err.code = data && data.code
      throw err
    }
    return data
  }
  _t(extra = {}) { return { token: this.token, ...extra } }

  // ── who am I, what can I see ──
  me() { return this.rpc('bot_me', this._t()) }
  // The groups the bot is in: [{ id, name, members, perms, channels: [{ id, name, topic, category }] }]
  async groups() { return (await this.me()).groups }
  async channel(name) { // find a channel id by name in any group the bot is in: bot.channel('general')
    const hit = (await this.groups()).flatMap((g) => g.channels.map((c) => ({ ...c, group_id: g.id }))).find((c) => c.name === name.replace(/^#/, '').toLowerCase())
    return hit || null
  }
  members(groupId, limit = 200) { return this.rpc('bot_members', this._t({ gid: groupId, lim: limit })) }
  history(channelId, { before = null, limit = 50 } = {}) { return this.rpc('bot_history', this._t({ channel: channelId, before_t: before, lim: limit })) }
  getMessage(messageId) { return this.rpc('bot_get_message', this._t({ message: messageId })) }
  pollResults(messageId) { return this.rpc('bot_poll_results', this._t({ message: messageId })) }

  // ── messages ──
  send(channelId, content, { reply = null } = {}) { return this.rpc('bot_send', this._t({ channel: channelId, content: NookBot.encodeMessage(content), reply })) } // content: text, or { content, embed, buttons, select } (see encodeMessage)
  edit(messageId, content) { return this.rpc('bot_edit', this._t({ message: messageId, content: NookBot.encodeMessage(content) })) }
  delete(messageId) { return this.rpc('bot_delete', this._t({ message: messageId })) } // other people's messages need the "messages" permission
  react(messageId, emoji) { return this.rpc('bot_react', this._t({ message: messageId, kind: emoji })) }
  unreact(messageId, emoji) { return this.rpc('bot_unreact', this._t({ message: messageId, kind: emoji })) }
  pin(messageId) { return this.rpc('bot_pin', this._t({ message: messageId, pin: true })) } // needs "messages"
  unpin(messageId) { return this.rpc('bot_pin', this._t({ message: messageId, pin: false })) }
  // A rich card. Fields: title, description, color ("#6475f5"), image, thumbnail, footer, url, fields: [[name, value], ...]
  embed(channelId, e, opts) { return this.send(channelId, NookBot.encodeEmbed(e), opts) }
  // A poll people can vote on. 2 to 6 options.
  poll(channelId, question, options, opts) { return this.send(channelId, NookBot.encodePoll(question, options), opts) }

  // ── moderation: each needs the matching permission, given in Group settings > Members ──
  kick(groupId, userId) { return this.rpc('bot_kick', this._t({ gid: groupId, member: userId })) } // members
  timeout(groupId, userId, minutes) { return this.rpc('bot_timeout', this._t({ gid: groupId, member: userId, minutes })) } // members; 0 ends it; max 28 days
  createChannel(groupId, name, topic = '') { return this.rpc('bot_create_channel', this._t({ gid: groupId, cname: name, topic })) } // channels
  deleteChannel(channelId) { return this.rpc('bot_delete_channel', this._t({ channel: channelId })) } // channels

  // ── more power (each needs the permission shown) ──
  renameChannel(channelId, name) { return this.rpc('bot_rename_channel', this._t({ channel: channelId, cname: name })) } // channels
  setTopic(channelId, topic) { return this.rpc('bot_set_topic', this._t({ channel: channelId, topic })) } // channels
  updateGroup(groupId, { name = null, description = null } = {}) { return this.rpc('bot_group_update', this._t({ gid: groupId, gname: name, descr: description })) } // customize
  inviteCode(groupId) { return this.rpc('bot_invite_code', this._t({ gid: groupId })) } // invites
  purge(channelId, count = 10) { return this.rpc('bot_purge', this._t({ channel: channelId, n: count })) } // messages; deletes the latest messages (max 100), returns how many
  pins(channelId) { return this.rpc('bot_pins', this._t({ channel: channelId })) }
  search(groupId, text, limit = 20) { return this.rpc('bot_search', this._t({ gid: groupId, q: text, lim: limit })) }
  audit(groupId, limit = 30) { return this.rpc('bot_audit', this._t({ gid: groupId, lim: limit })) } // members
  user(username) { return this.rpc('bot_user', this._t({ uname: username })) } // only people who share a group with the bot

  // ── the bot itself ──
  // "Playing Chess", "Listening to you", ... kind: playing | listening | watching | streaming | competing | building. setStatus() clears it.
  setStatus(kind = null, name = null) { return this.rpc('bot_set_status', this._t({ kind, name })) }
  leave(groupId) { return this.rpc('bot_leave', this._t({ gid: groupId })) }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

  // A connect key is "nkc_" + base64url of {u: site address, k: public key, t: bot token}. Keep it as private as the token.
  static decodeKey(key) {
    const k = String(key).trim()
    if (!k.startsWith('nkc_')) throw new Error('That is not a Nook connect key (it should start with nkc_)')
    try {
      const b64 = k.slice(4).replace(/-/g, '+').replace(/_/g, '/')
      const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      const d = JSON.parse(json)
      if (!d.u || !d.k || !d.t) throw new Error('missing fields')
      return d
    } catch { throw new Error('That connect key looks damaged. Copy it again from the Developer portal.') }
  }

  // Everything a bot message can hold:
  //   NookBot.encodeMessage({ content: 'Hi', embed: { title, description, color, image, thumbnail, footer, footerIcon, url, timestamp: true,
  //     author: { name, icon, url }, fields: [['Name', 'Value', true]] }, buttons: [{ id, label, style: 'primary|secondary|success|danger', url, disabled }],
  //     select: { id, placeholder, options: [{ label, value, description }] } })
  static encodeMessage(x) {
    if (typeof x !== 'object' || x === null) return String(x)
    const o = x.embed ? NookBot._embedObj(x.embed) : {}
    if (x.content) o.x = String(x.content).slice(0, 1000)
    if (x.buttons?.length) {
      o.bt = x.buttons.slice(0, 10).map((b) => (Array.isArray(b) ? b : [b.id || '', String(b.label || '').slice(0, 40), b.style || (b.url ? 'link' : 'secondary'), b.url || '', b.disabled ? 1 : 0]))
    }
    if (x.select) {
      const s = x.select
      o.sl = { id: s.id, ph: s.placeholder || s.ph || '', o: (s.options || s.o || []).slice(0, 25).map((p) => (Array.isArray(p) ? p : [String(p.label), String(p.value ?? p.label), p.description || ''])) }
    }
    if (!Object.keys(o).length) throw new Error('Empty message')
    if (Object.keys(o).length === 1 && o.x) return o.x
    const out = `<embed>${JSON.stringify(o)}`
    if (out.length > 2000) throw new Error(`That message is too big (${out.length} of 2000 characters). Shorten the text or drop a field.`)
    return out
  }
  static _embedObj(e) {
    const o = {}
    if (e.title) o.t = String(e.title).slice(0, 120)
    if (e.url) o.u = e.url
    if (e.description) o.d = String(e.description).slice(0, 1500)
    if (e.color) o.c = e.color
    if (e.image) o.i = e.image
    if (e.thumbnail) o.th = e.thumbnail
    if (e.footer) o.f = String(e.footer).slice(0, 80)
    if (e.footerIcon) o.fi = e.footerIcon
    if (e.timestamp) o.ts = e.timestamp === true ? new Date().toISOString() : new Date(e.timestamp).toISOString()
    if (e.author) o.a = { n: String(e.author.name || '').slice(0, 60), i: e.author.icon || e.author.image || '', u: e.author.url || '' }
    if (e.fields?.length) o.fl = e.fields.slice(0, 6).map(([n, v, inline]) => [String(n).slice(0, 40), String(v).slice(0, 200), inline ? 1 : 0])
    return o
  }
  static encodeEmbed(e) { return NookBot.encodeMessage({ embed: e }) }
  static encodePoll(q, options) {
    return `<poll>${JSON.stringify({ q: String(q).slice(0, 200), o: options.slice(0, 6).map((x) => String(x).slice(0, 80)) })}`
  }

  // ── the loop ──
  async start() {
    this.running = true
    this.info = await this.me() // throws "Invalid bot token" if the token is wrong
    this.cursor = this.info.now
    this.icursor = this.info.now
    if (this.slashCmds.size) {
      try { await this.registerCommands() } catch (e) { this._emit('error', new Error('Could not publish the slash commands: ' + e.message + ' (has update_v27.sql been run?)')) }
    }
    this._emit('ready', this.info)
    if (!this.handlers.ready) console.log(`Online as ${this.info.name} in ${this.info.groups.length} group(s). Press Ctrl+C to stop.`)
    let wait = this.interval
    while (this.running) {
      try {
        const events = await this._poll()
        for (const ev of events) {
          if (new Date(ev.at) > new Date(this.cursor)) this.cursor = ev.at
          this._dispatch(this._decorate(ev))
        }
        const clicks = await this._pollInteractions()
        for (const it of clicks) {
          if (new Date(it.at) > new Date(this.icursor)) this.icursor = it.at
          this._interaction(this._decorateInteraction(it))
        }
        wait = events.length >= 100 || clicks.length >= 100 ? 0 : this.interval
      } catch (e) {
        this._emit('error', e)
        wait = Math.min((wait || this.interval) * 2, 30000) // be gentle while something is wrong
      }
      if (wait) await this.sleep(wait)
    }
  }
  stop() { this.running = false }

  async _poll() {
    if (!this.legacy) {
      try {
        // Ask from one second earlier so nothing sharing a timestamp is missed; duplicates are dropped below.
        const after = new Date(new Date(this.cursor).getTime() - 1000).toISOString()
        const rows = await this.rpc('bot_events2', this._t({ after, lim: 100 }))
        return rows.filter((r) => {
          const key = `${r.type}:${r.message_id || r.user_id}:${r.at}:${r.kind || ''}:${r.user_id}`
          if (this.seen.has(key)) return false
          this.seen.add(key)
          if (this.seen.size > 3000) this.seen.delete(this.seen.values().next().value)
          return true
        })
      } catch (e) {
        if (e.code !== 'PGRST202' && !/bot_events2/.test(e.message)) throw e
        this.legacy = true // the database has not had update_v25.sql yet: messages only
      }
    }
    const rows = await this.rpc('bot_events', this._t({ after: this.cursor, lim: 100 }))
    return rows.map((m) => ({ type: 'message', at: m.created_at, group_id: m.group_id, group_name: m.group_name, channel_id: m.channel_id, channel_name: m.channel_name, message_id: m.id, user_id: m.author_id, username: m.author_username, display_name: m.author_name, is_bot: m.author_is_bot, content: m.content, reply_to: m.reply_to, kind: null, mentioned: m.mentioned }))
  }

  async _pollInteractions() {
    if (this.noInteractions) return []
    try {
      const after = new Date(new Date(this.icursor).getTime() - 1000).toISOString()
      const rows = await this.rpc('bot_interactions', this._t({ after, lim: 100 }))
      return rows.filter((r) => {
        if (this.iseen.has(r.id)) return false
        this.iseen.add(r.id)
        if (this.iseen.size > 3000) this.iseen.delete(this.iseen.values().next().value)
        return true
      })
    } catch (e) {
      if (e.code === 'PGRST202' || /bot_interactions/.test(e.message)) { this.noInteractions = true; return [] } // update_v27.sql not run yet
      throw e
    }
  }

  // An interaction is a slash command, a button press or a menu choice. i.reply(x), i.hidden(x), i.update(x)
  _decorateInteraction(r) {
    const i = { ...r, options: r.options || {}, values: r.picked || [], value: (r.picked || [])[0] ?? null }
    const answer = (x, opts = {}, mode = 'reply') => this.rpc('bot_respond', this._t({ interaction: r.id, content: NookBot.encodeMessage(x), hidden: !!(opts.hidden ?? (typeof x === 'object' && x && (x.hidden || x.ephemeral))), mode }))
    i.reply = (x, opts) => answer(x, opts)            // a message everyone sees (or { hidden: true }: only the person who clicked)
    i.hidden = (x) => answer(x, { hidden: true })     // a message only that person sees
    i.update = (x) => answer(x, {}, 'update')         // change the message the button was on
    i.say = (x) => this.send(r.channel_id, x)
    return i
  }

  _interaction(i) {
    this._emit('interaction', i)
    let fn = null
    if (i.kind === 'command') fn = this.slashCmds.get(i.name)?.fn
    else fn = this.components.find((c) => (c.match instanceof RegExp ? c.match.test(i.name) : typeof c.match === 'string' && c.match.endsWith('*') ? i.name.startsWith(c.match.slice(0, -1)) : c.match === i.name))?.fn
    if (!fn) {
      if (i.kind === 'command') i.hidden('Sorry, I do not know that command.').catch(() => {})
      return
    }
    Promise.resolve().then(() => fn(i)).catch((e) => { this._emit('error', e); i.hidden('Something went wrong running that.').catch(() => {}) })
  }

  // Adds the handy fields and shortcuts: m.id, m.author_*, m.reply(text), m.react(emoji), m.delete()
  _decorate(ev) {
    const m = { ...ev, id: ev.message_id, author_id: ev.user_id, author_username: ev.username, author_name: ev.display_name, author_is_bot: ev.is_bot, created_at: ev.at }
    m.reply = (text) => this.send(ev.channel_id, text, { reply: ev.message_id })
    m.say = (text) => this.send(ev.channel_id, text)
    m.react = (emoji) => this.react(ev.message_id, emoji)
    m.delete = () => this.delete(ev.message_id)
    return m
  }

  _dispatch(m) {
    if (m.type === 'edit') return this._emit('edit', m)
    if (m.type === 'reaction') return this._emit('reaction', m)
    if (m.type === 'member_join') return this._emit('memberJoin', m)
    this._emit('message', m)
    if (m.mentioned) this._emit('mention', m)
    if (m.content?.startsWith(this.prefix)) {
      const [head, ...rest] = m.content.slice(this.prefix.length).trim().split(/\s+/)
      const cmd = this.commands.get((head || '').toLowerCase())
      if (!cmd) return
      if (cmd.cooldown) {
        const k = `${head}:${m.user_id}`
        const until = this.cooldowns.get(k) || 0
        if (Date.now() < until) return
        this.cooldowns.set(k, Date.now() + cmd.cooldown * 1000)
      }
      Promise.resolve().then(() => cmd.fn(m, rest, rest.join(' '))).catch((e) => this._emit('error', e))
    }
  }
}
