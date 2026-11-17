// A poll is an ordinary message whose text starts with <poll> followed by JSON: { q: question, o: [options] }.
export const POLL_PREFIX = '<poll>'
export const POLL_MAX_OPTIONS = 6

// opts: { multi: pick many, hours: ends after this many hours, anon: hide who voted }
export function encodePoll(q, options, opts = {}) {
  const o = options.map((x) => String(x).trim()).filter(Boolean).slice(0, POLL_MAX_OPTIONS).map((x) => x.slice(0, 80))
  const p = { q: String(q).trim().slice(0, 200), o }
  if (opts.multi) p.m = true
  if (opts.anon) p.a = true
  if (opts.hours > 0) p.e = new Date(Date.now() + opts.hours * 3600 * 1000).toISOString()
  return POLL_PREFIX + JSON.stringify(p)
}

export function parsePoll(text) {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null
  try {
    const p = JSON.parse(text.slice(POLL_PREFIX.length))
    if (!p || typeof p.q !== 'string' || !Array.isArray(p.o)) return null
    const o = p.o.filter((x) => typeof x === 'string' && x).slice(0, POLL_MAX_OPTIONS).map((x) => x.slice(0, 80))
    if (o.length < 2) return null
    const e = typeof p.e === 'string' && !Number.isNaN(Date.parse(p.e)) ? p.e : null
    return { q: p.q.slice(0, 200), o, m: p.m === true, a: p.a === true, e }
  } catch { return null }
}

// "Ends in 2 h", "Ends in 12 min", "Ended"
export function pollTimeLeft(e, now = Date.now()) {
  if (!e) return null
  const ms = Date.parse(e) - now
  if (ms <= 0) return 'Ended'
  const m = Math.ceil(ms / 60000)
  if (m < 60) return `Ends in ${m} min`
  if (m < 60 * 24) return `Ends in ${Math.round(m / 60)} h`
  return `Ends in ${Math.round(m / 1440)} d`
}

export const pollSummary = (text) => { const p = parsePoll(text); return p ? `Poll: ${p.q}` : text }
