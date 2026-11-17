// Loads YouTube's official embedded player (the only supported way to play YouTube audio in another app).
let loading = null
export function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { loading = null; reject(new Error('YouTube could not be reached.')) }
    document.head.appendChild(s)
    setTimeout(() => { if (!window.YT?.Player) { loading = null; reject(new Error('YouTube took too long to load.')) } }, 15000)
  })
  return loading
}

// A title for a video, from YouTube's public lookup. Falls back to a plain name when it is not reachable.
export async function videoTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`)
    if (!r.ok) return ''
    const j = await r.json()
    return String(j.title || '').slice(0, 200)
  } catch { return '' }
}

// The video ids inside a playlist, found by loading it in a hidden player (up to 50).
export async function playlistVideos(listId) {
  const YT = await loadYouTube()
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:200px;height:200px'
  const inner = document.createElement('div')
  host.appendChild(inner)
  document.body.appendChild(host)
  let player
  try {
    return await new Promise((resolve, reject) => {
      const fail = (m) => reject(new Error(m))
      const timer = setTimeout(() => fail('That playlist did not load. It may be private.'), 12000)
      player = new YT.Player(inner, {
        width: 200, height: 200,
        playerVars: { listType: 'playlist', list: listId, autoplay: 0, controls: 0 },
        events: {
          onReady: () => {
            let tries = 0
            const poll = setInterval(() => {
              const ids = player.getPlaylist?.()
              if (ids?.length) { clearInterval(poll); clearTimeout(timer); resolve(ids.filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x)).slice(0, 50)) }
              else if (++tries > 30) { clearInterval(poll); clearTimeout(timer); fail('That playlist is empty or private.') }
            }, 300)
          },
          onError: () => { clearTimeout(timer); fail('That playlist cannot be opened. It may be private.') },
        },
      })
    })
  } finally {
    try { player?.destroy() } catch { /* ignore */ }
    host.remove()
  }
}
