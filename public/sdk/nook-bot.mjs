// nook-bot.mjs: a tiny library for making Nook bots. No dependencies. Needs Node 18 or newer (or Deno / Bun).
// Docs: https://YOUR-SITE/developers
//
//   import { NookBot } from './nook-bot.mjs'
//   const bot = new NookBot({ url: 'https://xxxx.supabase.co', anonKey: 'eyJ...', token: 'nk_...' })
//   bot.command('ping', (m) => bot.send(m.channel_id, 'pong!', { reply: m.id }))
//   bot.start()

export class NookBot {
  constructor({ url, anonKey, token, prefix = '!', interval = 1500 }) {
    if (!url || !anonKey || !token) throw new Error('NookBot needs url, anonKey and token')
    this.url = url.replace(/\/$/, '')
    this.anonKey = anonKey
    this.token = token
    this.prefix = prefix
    this.interval = interval
    this.handlers = { message: [], mention: [], ready: [], error: [] }
    this.commands = new Map()
    this.info = null
    this.running = false
    this.cursor = null
  }

  // ── events ──
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this }
  command(name, fn) { this.commands.set(name.toLowerCase(), fn); return this }
  _emit(event, ...args) {
    for (const fn of this.handlers[event] || []) {
      Promise.resolve().then(() => fn(...args)).catch((e) => this._emit('error', e))
    }
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
    if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`)
    return data
  }

  me() { return this.rpc('bot_me', { token: this.token }) }
  send(channelId, content, { reply = null } = {}) { return this.rpc('bot_send', { token: this.token, channel: channelId, content: String(content), reply }) }
  edit(messageId, content) { return this.rpc('bot_edit', { token: this.token, message: messageId, content: String(content) }) }
  delete(messageId) { return this.rpc('bot_delete', { token: this.token, message: messageId }) }
  react(messageId, emoji) { return this.rpc('bot_react', { token: this.token, message: messageId, kind: emoji }) }
  // A rich card. Fields: title, description, color ("#6475f5"), image, thumbnail, footer, url, fields: [[name, value], ...]
  embed(channelId, e, opts) { return this.send(channelId, NookBot.encodeEmbed(e), opts) }
  // A poll people can vote on. 2 to 6 options.
  poll(channelId, question, options, opts) { return this.send(channelId, NookBot.encodePoll(question, options), opts) }

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
        const events = await this.rpc('bot_events', { token: this.token, after: this.cursor, lim: 100 })
        for (const m of events) {
          this.cursor = m.created_at
          this._dispatch(m)
        }
        wait = events.length >= 100 ? 0 : this.interval
      } catch (e) {
        this._emit('error', e)
        wait = Math.min(wait * 2, 30000) // be gentle while something is wrong
      }
      if (wait) await new Promise((r) => setTimeout(r, wait))
    }
  }
  stop() { this.running = false }

  _dispatch(m) {
    this._emit('message', m)
    if (m.mentioned) this._emit('mention', m)
    if (m.content.startsWith(this.prefix)) {
      const [head, ...rest] = m.content.slice(this.prefix.length).trim().split(/\s+/)
      const fn = this.commands.get((head || '').toLowerCase())
      if (fn) Promise.resolve().then(() => fn(m, rest, rest.join(' '))).catch((e) => this._emit('error', e))
    }
  }
}
