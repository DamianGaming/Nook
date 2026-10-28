// @mentions: plain text like @maya, @everyone or @here, so they work in encrypted DMs too.
export const MENTION = /(^|[^a-z0-9_])@([a-z0-9_]{2,24})\b/gi

export function mentionsMe(text, username, everyone = false) {
  if (!text || !text.includes('@')) return false
  MENTION.lastIndex = 0
  let m
  while ((m = MENTION.exec(text))) {
    const n = m[2].toLowerCase()
    if ((everyone && (n === 'everyone' || n === 'here')) || n === (username || '').toLowerCase()) return true
  }
  return false
}

// What the person is typing right now: "@ma" just before the caret.
export function openMention(text, caret) {
  const m = /(^|[\s(])@([a-z0-9_]{0,24})$/i.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null
}
