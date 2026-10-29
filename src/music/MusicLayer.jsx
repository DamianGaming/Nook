import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { useCall } from '../call/CallProvider.jsx'
import { notify } from '../dialog.jsx'
import Icon from '../components/Icon.jsx'
import { useMusic, getMusic, setMusic, musicActions } from './store.js'
import { parseMusicLink, audioTitle } from './links.js'
import { loadYouTube, videoTitle, playlistVideos } from './youtube.js'

const friendly = (e) => (/function|schema cache|relation/i.test(e?.message || '') ? 'Music needs update_v22.sql to be run in Supabase first.' : e?.message || 'Something went wrong.')
const titleOf = (m, i) => i.title || m.titles[i.ref] || (i.source === 'youtube' ? 'YouTube video' : 'Audio file')

// Where we are in the current song, according to the shared clock, in seconds.
const expected = () => {
  const s = getMusic()
  return s.startedAt ? Math.max(0, (Date.now() + s.skew - new Date(s.startedAt).getTime()) / 1000) : 0
}

/* Plays the shared queue for as long as you are in a call, and shows the music panel.
   Everyone in the call hears the same song at the same point. Mute and volume here only change what YOU hear. */
export default function MusicLayer() {
  const c = useCall()
  const m = useMusic()
  const room = c.active ? { id: c.active.id, kind: c.active.kind } : null
  const roomKey = room ? `${room.kind}:${room.id}` : ''
  const roomRef = useRef(room)
  roomRef.current = room
  const hostRef = useRef(null)
  const yt = useRef(null)      // { player, ready, pending }
  const audio = useRef(null)
  const loadedId = useRef(null) // the song currently handed to a player
  const item = m.items.find((i) => i.id === m.current) || null

  const next = (finished) => {
    const r = roomRef.current
    if (!r) return
    supabase.rpc('music_next', { r: r.id, k: r.kind, finished: finished ?? null }).then(({ error }) => { if (error) notify(friendly(error), 'error') })
  }
  const ended = () => next(loadedId.current)
  const failed = (why) => {
    const cur = getMusic().items.find((i) => i.id === loadedId.current)
    notify(`Could not play "${cur ? titleOf(getMusic(), cur) : 'that song'}": ${why} Skipping it.`, 'error')
    ended()
  }

  /* ---- keep the queue in step with everyone else ---- */
  useEffect(() => {
    if (!room) return undefined
    let on = true
    let timer
    const load = async () => {
      const { data, error } = await supabase.rpc('music_get', { r: room.id, k: room.kind })
      if (!on) return
      if (error) return setMusic({ error: friendly(error), loaded: true })
      setMusic({ room, items: data.items || [], current: data.current, startedAt: data.started_at, skew: new Date(data.now).getTime() - Date.now(), error: '', loaded: true })
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(load, 120) }
    load()
    const ch = supabase.channel(`music-${roomKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_items', filter: `room=eq.${room.id}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_state', filter: `room=eq.${room.id}` }, soon)
      .subscribe()
    const poll = setInterval(load, 30000)
    return () => {
      on = false
      clearTimeout(timer)
      clearInterval(poll)
      supabase.removeChannel(ch)
      setMusic({ room: null, items: [], current: null, startedAt: null, loaded: false, error: '', blocked: false, open: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey])

  /* ---- what comes out of your speakers ---- */
  const applyVolume = () => {
    const s = getMusic()
    const quiet = s.muted || c.deaf
    const rec = yt.current
    if (rec?.ready) { try { rec.player.setVolume(s.volume); quiet ? rec.player.mute() : rec.player.unMute() } catch { /* player gone */ } }
    if (audio.current) { audio.current.volume = s.volume / 100; audio.current.muted = quiet }
  }
  useEffect(applyVolume, [m.muted, m.volume, c.deaf, m.current]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopAll = () => {
    try { yt.current?.player.stopVideo() } catch { /* ignore */ }
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); audio.current = null }
  }

  // Start, or restart, whenever the shared "now playing" song changes.
  useEffect(() => {
    if (!room) return undefined
    let dead = false
    loadedId.current = item?.id ?? null
    if (!item) { stopAll(); setMusic({ blocked: false }); return undefined }
    const start = expected()
    let blockTimer
    const watch = (isPlaying) => { clearTimeout(blockTimer); blockTimer = setTimeout(() => { if (!dead && !isPlaying()) setMusic({ blocked: true }) }, 4000) }

    if (item.source === 'audio') {
      try { yt.current?.player.stopVideo() } catch { /* ignore */ }
      if (audio.current) { audio.current.pause() }
      const a = new Audio()
      audio.current = a
      a.preload = 'auto'
      a.src = item.ref
      a.addEventListener('loadedmetadata', () => {
        if (dead) return
        const t = expected()
        if (Number.isFinite(a.duration) && t >= a.duration) return ended()
        try { a.currentTime = t } catch { /* not seekable: plays from the start */ }
      })
      a.addEventListener('ended', () => !dead && ended())
      a.addEventListener('error', () => !dead && failed('the link did not work.'))
      applyVolume()
      a.play().then(() => setMusic({ blocked: false })).catch(() => setMusic({ blocked: true }))
      musicActions.resume = () => a.play().then(() => setMusic({ blocked: false })).catch(() => {})
    } else {
      if (audio.current) { audio.current.pause(); audio.current = null }
      loadYouTube().then((YT) => {
        if (dead) return
        const go = () => {
          if (dead) return
          try { yt.current.player.loadVideoById({ videoId: item.ref, startSeconds: start }) } catch { return }
          applyVolume()
          watch(() => { const st = yt.current?.player.getPlayerState?.(); return st === 1 || st === 3 })
        }
        if (!yt.current) {
          const el = document.createElement('div')
          hostRef.current.appendChild(el)
          const rec = { player: null, ready: false, pending: null }
          yt.current = rec
          rec.player = new YT.Player(el, {
            width: 200, height: 200,
            playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, disablekb: 1 },
            events: {
              onReady: () => { rec.ready = true; rec.pending?.(); rec.pending = null },
              onStateChange: (e) => {
                if (e.data === YT.PlayerState.ENDED) ended()
                if (e.data === YT.PlayerState.PLAYING) {
                  setMusic({ blocked: false })
                  const t = rec.player.getVideoData?.().title
                  const cur = getMusic().items.find((i) => i.id === loadedId.current)
                  if (t && cur && !cur.title && !getMusic().titles[cur.ref]) setMusic({ titles: { ...getMusic().titles, [cur.ref]: t.slice(0, 200) } })
                }
              },
              onError: () => failed('YouTube would not play it here (it may be private or the owner blocked it).'),
              onAutoplayBlocked: () => setMusic({ blocked: true }),
            },
          })
        }
        if (yt.current.ready) go(); else yt.current.pending = go
        musicActions.resume = () => { try { yt.current.player.playVideo() } catch { /* ignore */ } }
      }).catch((e) => { if (!dead) setMusic({ error: e.message }) })
    }
    return () => { dead = true; clearTimeout(blockTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, m.startedAt, roomKey])

  // Gently pull back into step if this device drifted away from everyone else.
  useEffect(() => {
    if (!room) return undefined
    const t = setInterval(() => {
      const want = expected()
      try {
        if (audio.current && !audio.current.paused && Math.abs(audio.current.currentTime - want) > 3) audio.current.currentTime = want
        const rec = yt.current
        if (rec?.ready && rec.player.getPlayerState() === 1 && Math.abs(rec.player.getCurrentTime() - want) > 3) rec.player.seekTo(want, true)
      } catch { /* ignore */ }
    }, 15000)
    return () => clearInterval(t)
  }, [roomKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the call stops the music on this device.
  useEffect(() => () => {
    stopAll()
    try { yt.current?.player.destroy() } catch { /* ignore */ }
    yt.current = null
    loadedId.current = null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={hostRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 200, height: 200, overflow: 'hidden' }} />
      {m.open && room && <Panel m={m} room={room} item={item} />}
    </>
  )
}

function Panel({ m, room, item }) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const upNext = m.items.filter((i) => i.id !== m.current)

  async function add(e) {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    try {
      const p = parseMusicLink(link)
      let items
      if (p.kind === 'video') items = [{ source: 'youtube', ref: p.id, title: await videoTitle(p.id) }]
      else if (p.kind === 'audio') items = [{ source: 'audio', ref: p.url, title: audioTitle(p.url) }]
      else {
        setMsg('Reading the playlist…')
        const ids = await playlistVideos(p.id)
        items = []
        for (let i = 0; i < ids.length; i += 6) items.push(...(await Promise.all(ids.slice(i, i + 6).map(async (id) => ({ source: 'youtube', ref: id, title: await videoTitle(id) })))))
      }
      const { data, error } = await supabase.rpc('music_add', { r: room.id, k: room.kind, items })
      if (error) throw error
      setLink('')
      setMsg(`Added ${data} song${data === 1 ? '' : 's'}.`)
    } catch (err) {
      setMsg(friendly(err))
    } finally {
      setBusy(false)
    }
  }
  const act = (p) => p.then(({ error }) => { if (error) notify(friendly(error), 'error') })

  return (
    <section className="music-panel" role="dialog" aria-label="Music">
      <header>
        <strong><Icon name="music" size={16} /> Music</strong>
        <button className="icon-btn" onClick={() => setMusic({ open: false })} aria-label="Close music"><Icon name="x" size={16} /></button>
      </header>

      {m.error && <div className="error" role="alert">{m.error}</div>}

      <div className="music-now">
        {item ? (
          <>
            <span className="muted tiny">Now playing</span>
            <strong className="ellipsis" title={titleOf(m, item)}>{titleOf(m, item)}</strong>
          </>
        ) : <span className="muted small">{m.loaded ? 'Nothing is playing. Add a song below and everyone in the call hears it.' : 'Loading…'}</span>}
        {m.blocked && item && <button className="primary small" onClick={() => musicActions.resume?.()}>Tap to start the music</button>}
      </div>

      <div className="music-ctl">
        <button className={`ctrl ${m.muted ? 'off' : 'plain'}`} onClick={() => setMusic({ muted: !m.muted })} aria-pressed={m.muted} title={m.muted ? 'Unmute music (only for you)' : 'Mute music (only for you)'} aria-label={m.muted ? 'Unmute music for me' : 'Mute music for me'}>
          <Icon name={m.muted ? 'volumex' : 'volume'} size={18} />
        </button>
        <input type="range" min="0" max="100" value={m.volume} onChange={(e) => setMusic({ volume: Number(e.target.value), muted: false })} aria-label="Music volume (only for you)" />
        <button className="ctrl plain" disabled={!item} onClick={() => act(supabase.rpc('music_next', { r: room.id, k: room.kind, finished: m.current }))} title="Skip this song (for everyone)" aria-label="Skip song for everyone"><Icon name="skip" size={18} /></button>
      </div>
      <p className="muted tiny">Mute and volume only change what you hear. Skip and the queue are shared.</p>

      <form className="music-add" onSubmit={add}>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube link, playlist or audio file link" aria-label="Song or playlist link" disabled={busy} />
        <button className="primary" disabled={busy || !link.trim()}>{busy ? '…' : 'Add'}</button>
      </form>
      {msg && <div className="muted tiny" role="status">{msg}</div>}

      {upNext.length > 0 && (
        <>
          <div className="row between"><span className="muted tiny">Up next ({upNext.length})</span><button className="ghost small" onClick={() => act(supabase.rpc('music_clear', { r: room.id, k: room.kind }))}>Clear all</button></div>
          <ul className="music-queue">
            {upNext.map((i) => (
              <li key={i.id}>
                <span className="ellipsis" title={titleOf(m, i)}>{titleOf(m, i)}</span>
                <button className="icon-btn" onClick={() => act(supabase.rpc('music_remove', { item: i.id }))} aria-label={`Remove ${titleOf(m, i)}`}><Icon name="x" size={14} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
