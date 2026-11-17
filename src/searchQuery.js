// Understands "from:name has:image before:2026-10-01 after:2026-09-01 some words".
const HAS = new Set(['image', 'video', 'audio', 'file', 'link'])

function day(s) {
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseSearch(input) {
  const out = { text: '', from: '', has: '', before: null, after: null, bad: [] }
  const words = []
  for (const w of String(input).split(/\s+/).filter(Boolean)) {
    const m = /^(from|has|before|after):(.*)$/i.exec(w)
    if (!m) { words.push(w); continue }
    const k = m[1].toLowerCase()
    const v = m[2].replace(/^@/, '')
    if (!v) continue
    if (k === 'from') out.from = v
    else if (k === 'has') { if (HAS.has(v.toLowerCase())) out.has = v.toLowerCase(); else out.bad.push(w) }
    else {
      const d = day(v)
      if (!d) out.bad.push(w)
      else if (k === 'before') out.before = d
      else out.after = d
    }
  }
  out.text = words.join(' ')
  out.filtered = Boolean(out.from || out.has || out.before || out.after)
  return out
}

export const SEARCH_HINTS = ['from:', 'has:image', 'has:link', 'before:', 'after:']
