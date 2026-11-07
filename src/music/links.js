// Understands what people paste into the music box. Nook never downloads or re-streams anything:
// YouTube songs play in YouTube's own embedded player on each person's device, and direct audio links play in a normal audio tag.

const YT_HOSTS = /^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com)$/i
const BLOCKED = /(spotify\.com|apple\.com|music\.amazon|deezer\.com|tidal\.com|soundcloud\.com|pandora\.com)/i
const ID = /^[A-Za-z0-9_-]{11}$/

// Returns { kind: 'video', id } | { kind: 'playlist', id } | { kind: 'audio', url } or throws a friendly error.
export function parseMusicLink(raw) {
  const text = String(raw || '').trim()
  if (!text) throw new Error('Paste a link first.')
  let u
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`) } catch { throw new Error('That does not look like a link.') }
  if (u.protocol !== 'https:') throw new Error('Only secure (https) links work.')
  const host = u.hostname.toLowerCase()
  if (BLOCKED.test(host)) throw new Error('Spotify, Apple Music, SoundCloud and similar do not allow other apps to play their songs. Use a YouTube link, or a direct link to an audio file.')

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    if (ID.test(id)) return { kind: 'video', id }
  }
  if (YT_HOSTS.test(host)) {
    const list = u.searchParams.get('list')
    const v = u.searchParams.get('v')
    if (u.pathname.startsWith('/playlist') && list) return playlist(list)
    if (v && ID.test(v)) return { kind: 'video', id: v } // a video that happens to be inside a playlist adds just that video
    const m = /^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)
    if (m) return { kind: 'video', id: m[2] }
    if (list) return playlist(list)
  }
  if (/\.(mp3|m4a|aac|ogg|oga|wav|weba|webm)$/i.test(u.pathname)) return { kind: 'audio', url: u.toString() }
  throw new Error('I can play YouTube links, YouTube playlists, and direct links to audio files (ending in .mp3, .m4a, .ogg or .wav).')
}

function playlist(list) {
  if (/^RD/i.test(list)) throw new Error('YouTube "Mix" playlists are made up on the fly and cannot be added. Use a normal playlist, or add songs one by one.')
  if (!/^[A-Za-z0-9_-]{10,60}$/.test(list)) throw new Error('That playlist link is not valid.')
  return { kind: 'playlist', id: list }
}

export const audioTitle = (url) => {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Audio file' } catch { return 'Audio file' }
}
