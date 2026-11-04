// A poll is an ordinary message whose text starts with <poll> followed by JSON: { q: question, o: [options] }.
export const POLL_PREFIX = '<poll>'
export const POLL_MAX_OPTIONS = 6

export function encodePoll(q, options) {
  const o = options.map((x) => String(x).trim()).filter(Boolean).slice(0, POLL_MAX_OPTIONS).map((x) => x.slice(0, 80))
  return POLL_PREFIX + JSON.stringify({ q: String(q).trim().slice(0, 200), o })
}

export function parsePoll(text) {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null
  try {
    const p = JSON.parse(text.slice(POLL_PREFIX.length))
    if (!p || typeof p.q !== 'string' || !Array.isArray(p.o)) return null
    const o = p.o.filter((x) => typeof x === 'string' && x).slice(0, POLL_MAX_OPTIONS).map((x) => x.slice(0, 80))
    if (o.length < 2) return null
    return { q: p.q.slice(0, 200), o }
  } catch { return null }
}

export const pollSummary = (text) => { const p = parsePoll(text); return p ? `Poll: ${p.q}` : text }
