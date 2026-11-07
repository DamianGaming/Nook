// An invite link (https://…/?join=CODE) is remembered while the person signs in or signs up, then offered to them.
const KEY = 'nook-pending-join'
try {
  const u = new URL(location.href)
  const code = u.searchParams.get('join')
  if (code && /^[A-Za-z0-9]{6,40}$/.test(code)) {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
    u.searchParams.delete('join')
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash)
  }
} catch { /* storage blocked */ }

export function takePendingJoin() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    localStorage.removeItem(KEY)
    return v && Date.now() - v.at < 24 * 3600 * 1000 ? v.code : null
  } catch { return null }
}
