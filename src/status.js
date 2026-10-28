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
]
export function activityOf(p) {
  if (!p?.activity_type || !p.activity_name) return null
  const at = p.activity_at ? new Date(p.activity_at).getTime() : 0
  const a = ACTIVITIES.find((x) => x.id === p.activity_type)
  // Automatic ones are refreshed every few minutes while they are true, so they expire quickly if the app closes.
  // Ones you set yourself last a day.
  const auto = p.activity_src === 'auto' || a?.auto
  if (at && Date.now() - at > (auto ? 15 * 60 : 24 * 3600) * 1000) return null
  return a ? { ...a, name: p.activity_name, at } : null
}
export function sinceLabel(at) {
  if (!at) return ''
  const m = Math.max(1, Math.round((Date.now() - at) / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`
}
