import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import { confirmDialog } from '../dialog.jsx'

/* ───────── Activities ─────────
   Little shared apps that live in a channel: games and a video to watch together. Everyone in the group can join in.
   The rules are enforced by the database (activity_act), and changes reach everyone through Realtime. */

export const ACTIVITIES = [
  { kind: 'tictactoe', name: 'Tic-Tac-Toe', icon: 'grid', blurb: 'Two players, three in a row wins.' },
  { kind: 'connect4', name: 'Connect Four', icon: 'gamepad', blurb: 'Drop discs, get four in a line.' },
  { kind: 'watch', name: 'Watch Together', icon: 'play', blurb: 'Watch a YouTube video in sync.' },
  { kind: 'sketch', name: 'Sketch Pad', icon: 'pencil', blurb: 'Draw on one canvas, together.' },
  { kind: 'wordle', name: 'Wordle', icon: 'sparkle', blurb: 'Guess the five-letter word as a team.' },
  { kind: 'hangman', name: 'Hangman', icon: 'type', blurb: 'Find the word before the drawing is done.' },
  { kind: 'rps', name: 'Rock Paper Scissors', icon: 'hand', blurb: 'Hidden picks, first to three wins.' },
  { kind: 'memory', name: 'Memory Match', icon: 'cards', blurb: 'Flip cards and find the pairs. 1 to 4 players.' },
]
export const activityInfo = (kind) => ACTIVITIES.find((a) => a.kind === kind) || ACTIVITIES[0]

// The running activity of a channel, kept fresh by Realtime (plus a slow refresh as a safety net).
export function useChannelActivity(channelId) {
  const [act, setAct] = useState(null)
  const [skew, setSkew] = useState(0) // server time minus this device's time, in ms
  const load = useCallback(async () => {
    if (!channelId) return
    const { data, error } = await supabase.from('activity_sessions').select('*').eq('channel_id', channelId).is('ended_at', null).order('created_at', { ascending: false }).limit(1)
    if (!error) setAct((cur) => { const row = data?.[0] || null; return cur && row && cur.id === row.id && cur.version > row.version ? cur : row })
  }, [channelId])
  useEffect(() => {
    setAct(null)
    if (!channelId) return undefined
    let on = true
    load()
    const ch = supabase.channel(`activity:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_sessions', filter: `channel_id=eq.${channelId}` }, (p) => {
        const row = p.new
        if (!on || !row?.id) return load()
        setAct((cur) => {
          if (row.ended_at) return cur?.id === row.id ? null : cur
          if (cur && cur.id === row.id && cur.version > row.version) return cur
          return row
        })
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') load() }) // also catches up after a dropped connection
    const t = setInterval(() => { if (!document.hidden) load() }, 10000)
    const wake = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => { on = false; clearInterval(t); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); supabase.removeChannel(ch) }
  }, [channelId, load])
  useEffect(() => {
    const measure = () => { const t0 = Date.now(); supabase.rpc('activity_now').then(({ data }) => { if (data) setSkew(new Date(data).getTime() - (t0 + Date.now()) / 2) }) }
    measure()
    const t = setInterval(measure, 300000)
    return () => clearInterval(t)
  }, [])
  return { act, skew, reload: load }
}

/* Live extras for one running activity: who is here, plus quick messages that are never saved (pen strokes in progress, "Sam is typing", "Sam paused"). */
export function useActivityLive(sid, me) {
  const [here, setHere] = useState([])
  const chan = useRef(null)
  const handlers = useRef({})
  useEffect(() => {
    if (!sid || !me) return undefined
    const c = supabase.channel(`act-live:${sid}`, { config: { presence: { key: me }, broadcast: { self: false } } })
    c.on('presence', { event: 'sync' }, () => setHere(Object.keys(c.presenceState())))
      .on('broadcast', { event: 'ev' }, ({ payload }) => handlers.current[payload?.t]?.(payload))
      .subscribe((status) => { if (status === 'SUBSCRIBED') c.track({ at: Date.now() }) })
    chan.current = c
    return () => { chan.current = null; setHere([]); supabase.removeChannel(c) }
  }, [sid, me])
  const send = useCallback((t, data = {}) => { try { chan.current?.send({ type: 'broadcast', event: 'ev', payload: { t, u: me, ...data } }) } catch { /* offline */ } }, [me])
  const on = useCallback((t, fn) => { handlers.current[t] = fn; return () => { if (handlers.current[t] === fn) delete handlers.current[t] } }, [])
  return useMemo(() => ({ here, send, on }), [here, send, on])
}

export async function startActivity(channelId, kind) {
  const { data, error } = await supabase.rpc('start_activity', { channel: channelId, kind })
  return { id: data, error: error?.message || '' }
}

/* The header button with the list of things to start. */
export function ActivityMenu({ act, onStart, onOpen, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-act-btn]')) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div className="act-menu" ref={ref} role="menu" aria-label="Activities">
      <div className="act-menu-head">Activities</div>
      {act ? (
        <div className="act-running">
          <span className="act-ico"><Icon name={activityInfo(act.kind).icon} size={18} /></span>
          <span className="act-txt"><b>{activityInfo(act.kind).name}</b><span className="muted tiny">is running in this channel</span></span>
          <button type="button" className="primary small" onClick={onOpen}>Open</button>
        </div>
      ) : (
        ACTIVITIES.map((a) => (
          <button key={a.kind} type="button" role="menuitem" className="act-item" onClick={() => onStart(a.kind)}>
            <span className="act-ico"><Icon name={a.icon} size={18} /></span>
            <span className="act-txt"><b>{a.name}</b><span className="muted tiny">{a.blurb}</span></span>
          </button>
        ))
      )}
      {act && <p className="muted tiny act-note">One activity can run in a channel at a time. End it to start another.</p>}
    </div>
  )
}

const nameOf = (people, id) => { const p = people.find((x) => x.id === id); return p ? (p.display_name || p.username) : 'Someone' }
const profileOf = (people, id) => people.find((x) => x.id === id) || { id, username: '?' }

function Seat({ people, id, label, you, active }) {
  return (
    <div className={'act-seat' + (active ? ' turn' : '')}>
      <span className="act-seat-mark">{label}</span>
      {id ? <><Avatar profile={profileOf(people, id)} size={26} /><span className="ellipsis">{you ? 'You' : nameOf(people, id)}</span></> : <span className="muted">Open seat</span>}
    </div>
  )
}

function TicTacToe({ s, me, people, run }) {
  const st = s.state
  const seat = st.x === me ? 'x' : st.o === me ? 'o' : null
  const full = st.x && st.o
  const over = st.winner != null
  const mine = full && !over && st.turn === seat
  const line = new Set(st.line || [])
  const status = over ? (st.winner === 'draw' ? 'A draw.' : `${st[st.winner] === me ? 'You win!' : `${nameOf(people, st[st.winner])} wins!`}`) : !full ? 'Waiting for a second player…' : mine ? 'Your turn' : `${nameOf(people, st[st.turn])}'s turn`
  return (
    <div className="act-game">
      <div className="act-seats">
        <Seat people={people} id={st.x} label="X" you={st.x === me} active={full && !over && st.turn === 'x'} />
        <Seat people={people} id={st.o} label="O" you={st.o === me} active={full && !over && st.turn === 'o'} />
      </div>
      <div className="ttt" role="grid" aria-label="Tic-Tac-Toe board">
        {st.board.map((c, i) => (
          <button key={i} type="button" role="gridcell" className={'ttt-cell' + (c ? ` ${c}` : '') + (line.has(i) ? ' win' : '')} disabled={!mine || !!c} aria-label={`Square ${i + 1}${c ? `, ${c.toUpperCase()}` : ', empty'}`} onClick={() => run('move', { i })}>{c ? c.toUpperCase() : ''}</button>
        ))}
      </div>
      <p className={'act-status' + (mine ? ' mine' : '') + (over ? ' over' : '')} role="status">{status}</p>
      <div className="act-actions">
        {!seat && (!st.x || !st.o) && <button type="button" className="primary small" onClick={() => run('join')}>Take a seat</button>}
        {over && (seat || s.host === me) && <button type="button" className="primary small" onClick={() => run('reset')}>Rematch</button>}
        {seat && !over && <button type="button" className="ghost small" onClick={() => run('leave')}>Leave seat</button>}
      </div>
      <p className="muted tiny act-score">Score: X {st.scores?.x || 0} · O {st.scores?.o || 0} · Draws {st.scores?.draw || 0}</p>
    </div>
  )
}

function ConnectFour({ s, me, people, run }) {
  const st = s.state
  const seat = st.p1 === me ? 1 : st.p2 === me ? 2 : 0
  const full = st.p1 && st.p2
  const over = st.winner !== 0
  const mine = full && !over && st.turn === seat
  const line = new Set(st.line || [])
  const status = over ? (st.winner === 3 ? 'A draw.' : `${(st.winner === 1 ? st.p1 : st.p2) === me ? 'You win!' : `${nameOf(people, st.winner === 1 ? st.p1 : st.p2)} wins!`}`) : !full ? 'Waiting for a second player…' : mine ? 'Your turn: pick a column' : `${nameOf(people, st.turn === 1 ? st.p1 : st.p2)}'s turn`
  return (
    <div className="act-game">
      <div className="act-seats">
        <Seat people={people} id={st.p1} label={<i className="c4-dot p1" />} you={st.p1 === me} active={full && !over && st.turn === 1} />
        <Seat people={people} id={st.p2} label={<i className="c4-dot p2" />} you={st.p2 === me} active={full && !over && st.turn === 2} />
      </div>
      <div className="c4" role="group" aria-label="Connect Four board">
        <div className="c4-cols">
          {Array.from({ length: 7 }, (_, c) => (
            <button key={c} type="button" className="c4-col" disabled={!mine || st.board[c] !== 0} aria-label={`Drop in column ${c + 1}`} onClick={() => run('move', { col: c })}><Icon name="arrowdown" size={14} /></button>
          ))}
        </div>
        <div className="c4-board">
          {st.board.map((v, i) => <span key={i} className={'c4-cell' + (v ? ` p${v}` : '') + (line.has(i) ? ' win' : '')} />)}
        </div>
      </div>
      <p className={'act-status' + (mine ? ' mine' : '') + (over ? ' over' : '')} role="status">{status}</p>
      <div className="act-actions">
        {!seat && (!st.p1 || !st.p2) && <button type="button" className="primary small" onClick={() => run('join')}>Take a seat</button>}
        {over && (seat || s.host === me) && <button type="button" className="primary small" onClick={() => run('reset')}>Rematch</button>}
        {seat > 0 && !over && <button type="button" className="ghost small" onClick={() => run('leave')}>Leave seat</button>}
      </div>
      <p className="muted tiny act-score">Score: Red {st.scores?.p1 || 0} · Yellow {st.scores?.p2 || 0} · Draws {st.scores?.draw || 0}</p>
    </div>
  )
}

/* ── Watch Together: a YouTube player that follows the shared state ── */
let ytReady = null
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!ytReady) {
    ytReady = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
      const sc = document.createElement('script')
      sc.src = 'https://www.youtube.com/iframe_api'
      sc.async = true
      sc.onerror = () => { ytReady = null; reject(new Error('Could not load YouTube')) }
      document.head.appendChild(sc)
    })
  }
  return ytReady
}
const fmtClock = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(r).padStart(2, '0')}` }

function Watch({ s, skew, run, live, people, me }) {
  const st = s.state
  const box = useRef(null)
  const player = useRef(null)
  const ready = useRef(false)
  const stRef = useRef(st)
  stRef.current = st
  const [url, setUrl] = useState('')
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [drag, setDrag] = useState(null)
  const [vol, setVol] = useState(70)
  const [err, setErr] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [drift, setDrift] = useState(0)
  const target = (x) => (x.playing ? x.pos + Math.max(0, (Date.now() + skew - Date.parse(x.at)) / 1000) : x.pos)

  const sync = useCallback(() => {
    const p = player.current
    const x = stRef.current
    if (!p || !ready.current || !x.v) return
    try {
      const loaded = p.getVideoData?.().video_id
      if (loaded !== x.v) { p.loadVideoById({ videoId: x.v, startSeconds: target(x) }); if (!x.playing) setTimeout(() => p.pauseVideo?.(), 400); return }
      const want = target(x)
      if (Math.abs(p.getCurrentTime() - want) > 1.6) p.seekTo(want, true)
      const state = p.getPlayerState()
      if (x.playing && state !== 1 && state !== 3) { p.playVideo(); setTimeout(() => { if (p.getPlayerState() !== 1 && p.getPlayerState() !== 3) setBlocked(true) }, 1200) } else if (!x.playing && state === 1) p.pauseVideo()
    } catch { /* the player is not ready yet */ }
  }, [skew])

  useEffect(() => {
    if (!st.v || player.current) return undefined
    let dead = false
    loadYouTube().then((YT) => {
      if (dead || !box.current) return
      const holder = document.createElement('div')
      box.current.appendChild(holder)
      player.current = new YT.Player(holder, {
        videoId: stRef.current.v, width: '100%', height: '100%',
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, origin: window.location.origin },
        events: { onReady: (e) => { ready.current = true; e.target.setVolume(70); sync() }, onStateChange: (e) => { if (e.data === 1) setBlocked(false); if (e.data === 5) sync() }, onError: () => setErr('That video cannot be played here. Try another one.') },
      })
    }, () => setErr('Could not load YouTube. Check your connection or blocker.'))
    return () => { dead = true }
  }, [st.v, sync])
  useEffect(() => () => { try { player.current?.destroy?.() } catch { /* gone */ } player.current = null; ready.current = false }, [])
  useEffect(() => { setErr(''); sync() }, [st.v, st.playing, st.pos, st.at, sync])
  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current
      if (!p || !ready.current) return
      try { setCur(p.getCurrentTime() || 0); setDur(p.getDuration() || 0); const x = stRef.current; setDrift(x.v && p.getVideoData?.().video_id === x.v ? Math.abs(p.getCurrentTime() - target(x)) : 9) } catch { /* not ready */ }
      sync()
    }, 1000)
    return () => clearInterval(t)
  }, [sync])

  const act = (action, arg, text) => { live?.send('log', { text }); return run(action, arg) }
  const here = () => { try { return player.current?.getCurrentTime?.() || target(st) } catch { return target(st) } }
  return (
    <div className="act-game act-watch">
      {st.v ? (
        <div className="watch-frame"><div ref={box} className="watch-box" /></div>
      ) : (
        <div className="watch-empty"><Icon name="play" size={28} /><p>Paste a YouTube link to start watching together.</p></div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      {st.v && (
        <div className="watch-bar">
          <button type="button" className="icon-btn" aria-label={st.playing ? 'Pause for everyone' : 'Play for everyone'} onClick={() => act(st.playing ? 'pause' : 'play', { pos: here() }, `${nameOf(people, me)} ${st.playing ? 'paused' : 'pressed play'} at ${fmtClock(here())}`)}><Icon name={st.playing ? 'pause' : 'play'} size={18} /></button>
          <span className="tiny muted watch-time">{fmtClock(drag ?? cur)}</span>
          <input type="range" min={0} max={Math.max(1, Math.floor(dur))} value={Math.floor(drag ?? cur)} aria-label="Position" onChange={(e) => setDrag(Number(e.target.value))} onPointerUp={() => { if (drag != null) { act('seek', { pos: drag }, `${nameOf(people, me)} jumped to ${fmtClock(drag)}`); setDrag(null) } }} onKeyUp={() => { if (drag != null) { act('seek', { pos: drag }, `${nameOf(people, me)} jumped to ${fmtClock(drag)}`); setDrag(null) } }} />
          <span className="tiny muted watch-time">{fmtClock(dur)}</span>
          <span className={'watch-sync' + (drift < 2.5 ? ' ok' : '')} title={drift < 2.5 ? 'Your video matches everyone else' : 'Catching up with everyone'}><i />{drift < 2.5 ? 'In sync' : 'Syncing'}</span>
          <label className="watch-vol"><Icon name="volume" size={16} /><input type="range" min={0} max={100} value={vol} aria-label="Your volume" onChange={(e) => { setVol(Number(e.target.value)); try { player.current?.setVolume(Number(e.target.value)) } catch { /* not ready */ } }} /></label>
        </div>
      )}
      {blocked && <button type="button" className="primary small" onClick={() => { setBlocked(false); try { player.current?.playVideo() } catch { /* ignore */ } sync() }}>Tap to join the playback</button>}
      <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); if (url.trim()) act('load', { url: url.trim() }, `${nameOf(people, me)} changed the video`).then((m) => !m && setUrl('')) }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube link" aria-label="YouTube link" inputMode="url" />
        <button className="primary small" disabled={!url.trim()}>{st.v ? 'Change video' : 'Watch'}</button>
      </form>
      <p className="muted tiny">Everyone in the channel can press play, pause or move the bar. Videos load from YouTube, so YouTube may see that you watched.</p>
    </div>
  )
}

/* ── Sketch pad: one canvas for everyone. A stroke is shared when you lift your pen. ── */
const W = 1000
const H = 600
const SWATCHES = ['#111111', '#ffffff', '#e5484d', '#f5a524', '#f5d90a', '#30a46c', '#3e63dd', '#8e4ec6']
function Sketch({ s, run, me, live }) {
  const cv = useRef(null)
  const mine = useRef(null) // the stroke being drawn right now
  const others = useRef(new Map()) // strokes other people are drawing right now: person -> { id, c, w, p, at }
  const sent = useRef({ id: '', n: 0, at: 0 })
  const [tick, setTick] = useState(0)
  const [color, setColor] = useState('#3e63dd')
  const [size, setSize] = useState(6)
  const strokes = s.state.strokes || []
  const paint = useCallback((extra) => {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.lineCap = 'round'; g.lineJoin = 'round'
    const now = Date.now()
    const liveOthers = [...others.current.values()].filter((k) => now - k.at < 3000)
    for (const k of [...strokes, ...liveOthers, ...(extra ? [extra] : [])]) {
      const p = k.p
      g.strokeStyle = k.c; g.fillStyle = k.c; g.lineWidth = k.w
      if (p.length === 2 || (p.length === 4 && p[0] === p[2] && p[1] === p[3])) { g.beginPath(); g.arc(p[0], p[1], k.w / 2, 0, Math.PI * 2); g.fill(); continue }
      g.beginPath(); g.moveTo(p[0], p[1])
      for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1])
      g.stroke()
    }
  }, [strokes, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { paint(mine.current) }, [paint])
  useEffect(() => { others.current.clear(); setTick((n) => n + 1) }, [strokes.length]) // a saved stroke replaces its live preview
  useEffect(() => {
    if (!live) return undefined
    let raf = 0
    const bump = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((n) => n + 1) }) }
    const off = live.on('ink', (m) => {
      const cur = others.current.get(m.u)
      if (!cur || cur.id !== m.id) others.current.set(m.u, { id: m.id, c: m.c, w: m.w, p: [...m.p], at: Date.now() })
      else { cur.p.push(...m.p); cur.at = Date.now() }
      bump()
    })
    const t = setInterval(() => { if (others.current.size) bump() }, 1000) // lets stale previews fade away
    return () => { off(); clearInterval(t); cancelAnimationFrame(raf) }
  }, [live])
  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [Math.round(Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W))), Math.round(Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H)))] }
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); const [x, y] = pt(e); mine.current = { c: color, w: size, p: [x, y] }; sent.current = { id: Math.random().toString(36).slice(2, 8), n: 0, at: 0 }; paint(mine.current) }
  const move = (e) => { if (!mine.current) return; const [x, y] = pt(e); const p = mine.current.p; if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 3) return; p.push(x, y); paint(mine.current)
    const sx = sent.current
    if (live && Date.now() - sx.at > 70) { live.send('ink', { id: sx.id, c: mine.current.c, w: mine.current.w, p: p.slice(sx.n === 0 ? 0 : sx.n - 2) }); sx.n = p.length; sx.at = Date.now() } }
  const up = () => {
    const k = mine.current
    mine.current = null
    if (!k) return
    if (live && sent.current.n < k.p.length) live.send('ink', { id: sent.current.id, c: k.c, w: k.w, p: k.p.slice(Math.max(0, sent.current.n - 2)) })
    let p = k.p
    if (p.length > 700) { const keep = []; const step = Math.ceil(p.length / 2 / 340); for (let i = 0; i < p.length; i += 2 * step) keep.push(p[i], p[i + 1]); keep.push(p[p.length - 2], p[p.length - 1]); p = keep }
    run('stroke', { c: k.c, w: k.w, p })
  }
  const hasMine = strokes.some((k) => k.u === me)
  return (
    <div className="act-game act-sketch">
      <canvas ref={cv} width={W} height={H} className="sketch-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Shared drawing board" role="img" />
      <div className="sketch-tools">
        <div className="row tight" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} className="swatch" style={{ background: c }} aria-label={c === '#ffffff' ? 'Eraser (white)' : c} onClick={() => setColor(c)} />)}
        </div>
        <label className="sketch-size">Brush <input type="range" min={2} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Brush size" /></label>
        <button type="button" className="ghost small" disabled={!hasMine} onClick={() => run('undo')}>Undo mine</button>
        <button type="button" className="ghost small" disabled={!strokes.length} onClick={async () => { if (await confirmDialog({ title: 'Clear the board for everyone?', body: 'Everything drawn so far will be erased.', confirmLabel: 'Clear it' })) run('clear') }}>Clear</button>
      </div>
    </div>
  )
}


/* ── Wordle: the whole channel guesses one word together. The word lives on the server until the round ends. ── */
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
function Wordle({ s, run, live, me, people }) {
  const st = s.state
  const [typed, setTyped] = useState('')
  const [ghost, setGhost] = useState(null) // what a teammate is typing right now
  const [shake, setShake] = useState(false)
  const [toast, setToast] = useState('')
  const seen = useRef(st.guesses.length) // rows that were already there on open do not flip
  if (st.guesses.length === 0) seen.current = 0
  const playing = st.status === 'playing'
  const rank = { g: 3, y: 2, b: 1 }
  const best = {}
  for (const g of st.guesses) [...g.w].forEach((ch, i) => { const r = g.r[i]; if (!best[ch] || rank[r] > rank[best[ch]]) best[ch] = r })
  const say = useCallback((m) => { setToast(m); clearTimeout(say.t); say.t = setTimeout(() => setToast(''), 1600) }, [])
  const bad = useCallback((m) => { setShake(true); say(m); setTimeout(() => setShake(false), 500) }, [say])
  const submit = useCallback(async () => {
    if (typed.length !== 5) { bad('Not enough letters'); return }
    if (s.state.guesses.some((g) => g.w === typed)) { bad('Already tried'); return }
    const m = await run('guess', { w: typed })
    if (!m) setTyped(''); else bad(/word/i.test(m) ? 'Not in word list' : m)
  }, [typed, run, bad, s.state.guesses])
  useEffect(() => { // show teammates what is being typed, and forget it once it goes quiet
    if (!live) return undefined
    const off = live.on('type', (m) => setGhost(m.w ? { u: m.u, w: String(m.w).slice(0, 5), at: Date.now() } : null))
    const t = setInterval(() => setGhost((g) => (g && Date.now() - g.at > 5000 ? null : g)), 1000)
    return () => { off(); clearInterval(t) }
  }, [live])
  useEffect(() => { live?.send('type', { w: typed }) }, [typed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setGhost(null) }, [st.guesses.length])
  const add = (k) => setTyped((x) => (x.length < 5 ? x + k : x))
  const del = () => setTyped((x) => x.slice(0, -1))
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (t && t !== document.body && !t.closest?.('.act-dock')) return
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (!playing) return
      if (e.key === 'Enter') { e.preventDefault(); submit() } else if (e.key === 'Backspace') del()
      else if (/^[a-zA-Z]$/.test(e.key)) add(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, submit])
  const rows = Array.from({ length: 6 }, (_, i) => st.guesses[i] || (i === st.guesses.length && playing ? { w: (typed || (ghost && ghost.u !== me ? ghost.w : '')).padEnd(5, ' '), r: '', live: true, ghost: !typed && !!ghost } : { w: '     ', r: '' }))
  const praise = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][Math.max(0, st.guesses.length - 1)]
  return (
    <div className="act-game wd">
      <div className="wd-toast-slot" aria-live="polite">{toast && <span className="wd-toast">{toast}</span>}</div>
      <div className="wd-board" role="grid" aria-label="Wordle board">
        {rows.map((row, i) => (
          <div key={i} className={'wd-row' + (row.live && shake ? ' shake' : '')} role="row">
            {[...row.w].map((ch, j) => {
              const c = ch.trim()
              const flip = row.r && i >= seen.current
              return <span key={j + ch} role="gridcell" className={'wd-cell' + (row.r ? ` ${row.r[j]}` : c ? ' typing' : '') + (row.ghost && c ? ' ghost' : '') + (flip ? ' flip' : '') + (c && !row.r ? ' pop' : '')} style={flip ? { animationDelay: `${j * 0.3}s` } : undefined} aria-label={row.r ? `${ch}, ${{ g: 'correct', y: 'wrong place', b: 'not in the word' }[row.r[j]]}` : c || 'empty'}>{c.toUpperCase()}</span>
            })}
          </div>
        ))}
      </div>
      <p className="act-status" role="status">{st.status === 'won' ? `${praise}! The word was ${st.answer.toUpperCase()}.` : st.status === 'lost' ? `The word was ${st.answer.toUpperCase()}. Better luck next time.` : (ghost && !typed ? `${nameOf(people, ghost.u)} is typing…` : `Guess ${st.guesses.length + 1} of 6. Everyone guesses together.`)}</p>
      {playing ? (
        <div className="wd-keys" aria-label="Keyboard">
          {KEYS.map((row, ri) => (
            <div key={ri} className="wd-krow">
              {ri === 1 && <span className="wd-half" />}
              {ri === 2 && <button type="button" className="wd-key wide" onClick={submit}>Enter</button>}
              {[...row].map((k) => <button key={k} type="button" className={'wd-key' + (best[k] ? ` ${best[k]}` : '')} onClick={() => add(k)}>{k.toUpperCase()}</button>)}
              {ri === 2 && <button type="button" className="wd-key wide" aria-label="Delete" onClick={del}><Icon name="delete" size={20} /></button>}
              {ri === 1 && <span className="wd-half" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="act-actions"><button type="button" className="primary small" onClick={() => run('new')}>Play again</button></div>
      )}
      <p className="muted tiny act-score">Solved {st.wins} · Missed {st.losses}</p>
    </div>
  )
}

/* ── Hangman ── */
function Hangman({ s, run }) {
  const st = s.state
  const playing = st.status === 'playing'
  const w = st.wrong
  const part = (n, el) => (w >= n ? el : null)
  return (
    <div className="act-game">
      <svg className="hm-fig" viewBox="0 0 120 130" role="img" aria-label={`${w} of 7 parts drawn`}>
        <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
          <path d="M10 124h80M30 124V10h56v14" />
          {part(1, <circle cx="86" cy="38" r="14" />)}
          {part(2, <path d="M86 52v36" />)}
          {part(3, <path d="M86 62 68 78" />)}
          {part(4, <path d="M86 62l18 16" />)}
          {part(5, <path d="M86 88 70 112" />)}
          {part(6, <path d="M86 88l16 24" />)}
          {part(7, <path d="m80 34 4 4m0-4-4 4m12-4 4 4m0-4-4 4" strokeWidth="2.5" />)}
        </g>
      </svg>
      <div className="hm-word" aria-label="The word">{st.mask.map((c, i) => <span key={i} className="hm-slot">{(c || (st.answer ? st.answer[i] : '')).toUpperCase()}</span>)}</div>
      <p className="act-status" role="status">{st.status === 'won' ? 'You found it!' : st.status === 'lost' ? `Out of tries. It was ${st.answer.toUpperCase()}.` : `${7 - w} mistakes left. Anyone can guess a letter.`}</p>
      {playing ? (
        <div className="hm-keys">
          {'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => {
            const used = st.guessed.includes(l)
            const good = used && st.mask.includes(l)
            return <button key={l} type="button" className={'hm-key' + (used ? (good ? ' g' : ' b') : '')} disabled={used} onClick={() => run('guess', { l })}>{l.toUpperCase()}</button>
          })}
        </div>
      ) : <div className="act-actions"><button type="button" className="primary small" onClick={() => run('new')}>New word</button></div>}
      <p className="muted tiny act-score">Solved {st.wins} · Missed {st.losses}</p>
    </div>
  )
}

/* ── Rock Paper Scissors ── */
const RPS = { r: ['rock', 'Rock'], p: ['hand', 'Paper'], s: ['scissors', 'Scissors'] }
function Rps({ s, me, people, run }) {
  const st = s.state
  const seat = st.a === me ? 'a' : st.b === me ? 'b' : null
  const full = st.a && st.b
  const over = st.winner != null
  const waiting = seat && st.picked?.[seat]
  const last = st.last
  const who = (k) => (st[k] === me ? 'You' : nameOf(people, st[k]))
  return (
    <div className="act-game">
      <div className="act-seats">
        <Seat people={people} id={st.a} label="A" you={st.a === me} active={full && !over && !st.picked?.a} />
        <Seat people={people} id={st.b} label="B" you={st.b === me} active={full && !over && !st.picked?.b} />
      </div>
      <p className="act-score big">{st.scores.a} – {st.scores.b} <span className="muted tiny">first to {st.target}</span></p>
      {last && (
        <div className="rps-last" role="status">
          <span className="rps-pick"><Icon name={RPS[last.a][0]} size={34} /></span><span className="muted">vs</span><span className="rps-pick"><Icon name={RPS[last.b][0]} size={34} /></span>
          <b>{last.res === 'draw' ? 'Draw, go again' : `${who(last.res)} won round ${last.round}`}</b>
        </div>
      )}
      {seat && full && !over && (
        <div className="rps-btns" role="group" aria-label="Your pick">
          {Object.entries(RPS).map(([c, [e, n]]) => <button key={c} type="button" className="rps-btn" disabled={waiting} onClick={() => run('pick', { c })}><Icon name={e} size={30} /><span className="tiny">{n}</span></button>)}
        </div>
      )}
      <p className="act-status" role="status">{over ? `${who(st.winner)} won the match!` : !full ? 'Waiting for a second player…' : !seat ? 'Players are picking in secret…' : waiting ? 'Picked. Waiting for your opponent…' : 'Make your pick'}</p>
      <div className="act-actions">
        {!seat && !full && <button type="button" className="primary small" onClick={() => run('join')}>Take a seat</button>}
        {over && (seat || s.host === me) && <button type="button" className="primary small" onClick={() => run('reset')}>Rematch</button>}
        {seat && !over && <button type="button" className="ghost small" onClick={() => run('leave')}>Leave seat</button>}
      </div>
    </div>
  )
}

/* ── Memory Match ── */
function Memory({ s, me, people, run }) {
  const st = s.state
  const seated = st.players.includes(me)
  const turnId = st.players[st.turn]
  const mine = seated && turnId === me && !st.over
  const pending = new Set(st.flipped || [])
  const top = st.over ? st.winners : []
  return (
    <div className="act-game">
      <div className="act-seats">
        {st.players.map((id) => <Seat key={id} people={people} id={id} label={st.scores?.[id] ?? 0} you={id === me} active={!st.over && id === turnId} />)}
      </div>
      <div className="mm-board" role="group" aria-label="Memory cards">
        {st.cards.map((c, i) => {
          const up = c !== ''
          return <button key={i} type="button" className={'mm-card' + (up ? ' up' : '') + (st.matched[i] ? ' done' : '') + (pending.has(i) ? ' pend' : '')} disabled={!mine || st.matched[i] || pending.has(i) && pending.size === 1} aria-label={up ? `Card ${i + 1}: ${c}` : `Card ${i + 1}, face down`} onClick={() => run('flip', { i })}>{up ? c : ''}</button>
        })}
      </div>
      <p className="act-status" role="status">{st.over ? (top.length > 1 ? 'A tie!' : `${top[0] === me ? 'You win' : `${nameOf(people, top[0])} wins`}!`) : !seated ? 'Take a seat to play.' : mine ? 'Your turn: flip a card' : `${nameOf(people, turnId)}'s turn`}</p>
      <div className="act-actions">
        {!seated && st.players.length < 4 && <button type="button" className="primary small" onClick={() => run('join')}>Take a seat</button>}
        {st.over && (seated || s.host === me) && <button type="button" className="primary small" onClick={() => run('reset')}>Play again</button>}
      </div>
    </div>
  )
}

/* The panel above the messages. */
export function ActivityDock({ s, me, people, skew, canEnd, onClose, onEnded, reload }) {
  const [err, setErr] = useState('')
  const [line, setLine] = useState('')
  const live = useActivityLive(s.id, me)
  useEffect(() => {
    let t
    const off = live.on('log', (m) => { if (!m.text) return; setLine(m.text); clearTimeout(t); t = setTimeout(() => setLine(''), 5000) })
    return () => { off(); clearTimeout(t) }
  }, [live])
  const info = activityInfo(s.kind)
  const run = useCallback(async (action, arg = {}) => {
    const { error } = await supabase.rpc('activity_act', { sid: s.id, act: action, arg })
    if (error) { setErr(error.message); setTimeout(() => setErr(''), 4000); reload?.(); return error.message }
    setErr('')
    reload?.()
    return ''
  }, [s.id, reload])
  async function end() {
    if (!(await confirmDialog({ title: `End ${info.name}?`, body: 'It closes for everyone in the channel.', confirmLabel: 'End it' }))) return
    const { error } = await supabase.rpc('end_activity', { sid: s.id })
    if (error) setErr(error.message); else onEnded?.()
  }
  const Body = { tictactoe: TicTacToe, connect4: ConnectFour, watch: Watch, sketch: Sketch, wordle: Wordle, hangman: Hangman, rps: Rps, memory: Memory }[s.kind]
  return (
    <section className="act-dock" aria-label={info.name}>
      <header className="act-dock-head">
        <span className="act-ico"><Icon name={info.icon} size={17} /></span>
        <strong>{info.name}</strong>
        <span className="muted tiny ellipsis">started by {nameOf(people, s.host)}</span>
        <span className="grow" />
        {live.here.length > 0 && (
          <span className="act-here" title={`${live.here.length} here now`} aria-label={`${live.here.length} here now`}>
            {live.here.slice(0, 4).map((id) => <Avatar key={id} profile={profileOf(people, id)} size={22} />)}
            {live.here.length > 4 && <span className="act-here-more">+{live.here.length - 4}</span>}
          </span>
        )}
        <button type="button" className="ghost small" onClick={onClose}>Hide</button>
        {canEnd && <button type="button" className="ghost small danger" onClick={end}>End</button>}
      </header>
      {err && <div className="error" role="alert">{err}</div>}
      {Body && <Body s={s} me={me} people={people} skew={skew} run={run} live={live} />}
      {line && <p className="act-line" role="status">{line}</p>}
    </section>
  )
}
