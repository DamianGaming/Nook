// Social links on a profile: plain http(s) links, shown as small chips. Nothing is ever fetched from them.
export function normalizeUrl(input) {
  let v = (input || '').trim()
  if (!v) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString().slice(0, 200)
  } catch { return null }
}

export function hostLabel(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/$/, '')
    return path && path.length < 24 ? `${host}${path}` : host
  } catch { return url }
}

export const linksOf = (profile) => (Array.isArray(profile?.socials) ? profile.socials.filter((s) => s?.url && normalizeUrl(s.url)).slice(0, 5) : [])
