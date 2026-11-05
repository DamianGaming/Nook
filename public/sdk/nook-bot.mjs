// nook-bot.mjs (v2): a small library for making Nook bots. No dependencies. Needs Node 18 or newer (or Deno / Bun).
// Guide: https://YOUR-SITE/developers
//
//   import { NookBot } from './nook-bot.mjs'
//   const bot = new NookBot({ url: 'https://xxxx.supabase.co', anonKey: 'eyJ...', token: 'nk_...' })
//   bot.command('ping', (m) => m.reply('pong!'))
//   bot.start()

export class NookBot {
  constructor({ url, anonKey, token, prefix = '!', interval = 1500, help = true }) {
    if (!url || !anonKey || !token) throw new Error('NookBot needs url, anonKey and token')
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
    this.kv = {
      get: (key) => this.rpc('bot_kv_get', { token, key }),
      set: (key, value) => this.rpc('bot_kv_set', { token, key, value }),
      delete: (key) => this.rpc('bot_kv_delete', { token, key }),
      list: (prefix = '') => this.rpc('bot_kv_list', { token, prefix }),
    }
    if (help) this.command('help', (m) => m.reply(this.helpText()), { description: 'Show this list' })
  }

  // ── events: message, mention, edit, reaction, memberJoin, ready, error ──
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this }
  // bot.command('roll', handler, { description: 'Roll a die', cooldown: 5 })  (cooldown in seconds, per person)
  command(name, fn, opts = {}) { this.commands.set(name.toLowerCase(), { fn, ...opts }); return this }
  helpText() {
    const lines = [...this.commands.entries()].filter(([, c]) => c.description).map(([n, c]) => `**${this.prefix}${n}**: ${c.description}`)
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
  send(channelId, content, { reply = null } = {}) { return this.rpc('bot_send', this._t({ channel: channelId, content: String(content), reply })) }
  edit(messageId, content) { return this.rpc('bot_edit', this._t({ message: messageId, content: String(content) })) }
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

  // ── the bot itself ──
  // "Playing Chess", "Listening to you", ... kind: playing | listening | watching | streaming | competing | building. setStatus() clears it.
  setStatus(kind = null, name = null) { return this.rpc('bot_set_status', this._t({ kind, name })) }
  leave(groupId) { return this.rpc('bot_leave', this._t({ gid: groupId })) }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

  static encodeEmbed(e) {
    const o = {}
    if (e.title) o.t = e.title.slice(0, 80)
    if (e.url) o.u = e.url
    if (e.description) o.d = e.description.slice(0, 500)
    if (e.color) o.c = e.color
    if (e.image) o.i = e.image
    if (e.thumbnail) o.th = e.thumbnail
    if (e.footer) o.f = e.footer.slice(0, 60)
    if (e.fields?.length) o.fl = e.fields.slice(0, 4).map(([n, v]) => [String(n).slice(0, 30), String(v).slice(0, 100)])
    return `<embed>${JSON.stringify(o)}`
  }
  static encodePoll(q, options) {
    return `<poll>${JSON.stringify({ q: String(q).slice(0, 200), o: options.slice(0, 6).map((x) => String(x).slice(0, 80)) })}`
  }

  // ── the loop ──
  async start() {
    this.running = true
    this.info = await this.me() // throws "Invalid bot token" if the token is wrong
    this.cursor = this.info.now
    this._emit('ready', this.info)
    let wait = this.interval
    while (this.running) {
      try {
        const events = await this._poll()
        for (const ev of events) {
          if (new Date(ev.at) > new Date(this.cursor)) this.cursor = ev.at
          this._dispatch(this._decorate(ev))
        }
        wait = events.length >= 100 ? 0 : this.interval
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
