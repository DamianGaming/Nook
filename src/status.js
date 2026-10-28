// Presence statuses and the small custom status ("what are you up to") that goes with them.
export const STATUSES = [
  { id: 'online', label: 'Online', desc: 'Around and happy to chat', color: '#43d17a' },
  { id: 'idle', label: 'Idle', desc: 'Away for a bit', color: '#f5b83d' },
  { id: 'dnd', label: 'Do not disturb', desc: 'No pings, no sounds', color: '#ff5d6c' },
  { id: 'invisible', label: 'Invisible', desc: 'Show as offline, still online', color: '#6b7090' },
]
export const STATUS_COLOR = { online: '#43d17a', idle: '#f5b83d', dnd: '#ff5d6c', offline: '#6b7090', invisible: '#6b7090' }
export const STATUS_ICONS = ['smile', 'heart', 'star', 'sparkle', 'bell', 'moon']

export const CLEAR_AFTER = [
  { id: 'never', label: "Don't clear" },
  { id: '30', label: '30 minutes' },
  { id: '60', label: '1 hour' },
  { id: '240', label: '4 hours' },
  { id: 'today', label: 'Today' },
]

export function expiryFor(id) {
  if (id === 'never') return null
  if (id === 'today') { const d = new Date(); d.setHours(23, 59, 59, 0); return d.toISOString() }
  return new Date(Date.now() + Number(id) * 60000).toISOString()
}

export const statusExpired = (p) => Boolean(p?.status_expires_at && new Date(p.status_expires_at) <= new Date())

// Activity: what you are doing right now, set by hand ("Playing Minecraft"). Hidden again after a day.
export const ACTIVITIES = [
  { id: 'playing', verb: 'Playing', icon: 'play', hint: 'a game' },
  { id: 'listening', verb: 'Listening to', icon: 'headphones', hint: 'music or a podcast' },
  { id: 'watching', verb: 'Watching', icon: 'video', hint: 'a show or film' },
  { id: 'streaming', verb: 'Streaming', icon: 'monitor', hint: 'what you stream' },
  { id: 'competing', verb: 'Competing in', icon: 'star', hint: 'a tournament' },
  { id: 'building', verb: 'Building', icon: 'settings', hint: 'a project' },
  { id: 'calling', verb: 'In a call in', icon: 'headphones', hint: '', auto: true },
  { id: 'sharing', verb: 'Sharing their screen in', icon: 'monitor', hint: '', auto: true },
  { id: 'using', verb: 'Using', icon: 'popout', hint: '', auto: true },
]
const ORDER = ['sharing', 'playing', 'streaming', 'listening', 'using', 'calling']
const ICON_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/activity-[a-z0-9]{1,16}\.png$/
const AUTO_FRESH = 15 * 60 * 1000 // refreshed every few minutes while true, so it fades if the app closes
const MANUAL_FRESH = 24 * 3600 * 1000

/* Every activity to show for someone: the one they set themselves, then the automatic ones, in a steady order.
   Each is { id, verb, icon, name, at, img, auto }. */
export function activityList(p) {
  if (!p) return []
  const out = []
  const now = Date.now()
  // Set by hand
  if (p.activity_type && p.activity_name && p.activity_src !== 'auto') {
    const a = ACTIVITIES.find((x) => x.id === p.activity_type && !x.auto)
    const at = p.activity_at ? new Date(p.activity_at).getTime() : 0
    if (a && (!at || now - at <= MANUAL_FRESH)) out.push({ ...a, name: p.activity_name, at, img: null, auto: false })
  }
  // Found automatically
  const seen = p.activity_seen ? new Date(p.activity_seen).getTime() : 0
  if (Array.isArray(p.activities) && p.activities.length && (!seen || now - seen <= AUTO_FRESH)) {
    const auto = []
    for (const e of p.activities) {
      const a = e && ACTIVITIES.find((x) => x.id === e.t)
      if (!a || typeof e.n !== 'string' || !e.n) continue
      auto.push({ ...a, name: e.n.slice(0, 60), at: e.s ? new Date(e.s).getTime() : 0, img: typeof e.i === 'string' && ICON_PATH.test(e.i) ? e.i : null, auto: true })
    }
    auto.sort((x, y) => ORDER.indexOf(x.id) - ORDER.indexOf(y.id))
    out.push(...auto)
  }
  return out.slice(0, 5)
}
/* The main one, for one-line summaries. */
export const activityOf = (p) => activityList(p)[0] || null
/* The one you set yourself (what the menu edits). */
export function manualActivity(p) {
  const a = activityList(p).find((x) => !x.auto)
  return a || null
}
/* One line: "Playing Minecraft", or "Playing Minecraft +2" when there are more. */
export function activityText(p) {
  const l = activityList(p)
  return l.length ? `${l[0].verb} ${l[0].name}${l.length > 1 ? ` +${l.length - 1}` : ''}` : ''
}
export function sinceLabel(at) {
  if (!at) return ''
  const m = Math.floor((Date.now() - at) / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  return `${Math.floor(h / 24)}d`
}
