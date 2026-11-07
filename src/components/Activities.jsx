import { useCallback, useEffect, useRef, useState } from 'react'
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
      .subscribe()
    const t = setInterval(() => { if (!document.hidden) load() }, 20000)
    return () => { on = false; clearInterval(t); supabase.removeChannel(ch) }
  }, [channelId, load])
  useEffect(() => {
    const t0 = Date.now()
    supabase.rpc('activity_now').then(({ data }) => { if (data) setSkew(new Date(data).getTime() - (t0 + Date.now()) / 2) })
  }, [])
  return { act, skew, reload: load }
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
      <p className="act-status" role="status">{status}</p>
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
      <p className="act-status" role="status">{status}</p>
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

function Watch({ s, skew, run }) {
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
      try { setCur(p.getCurrentTime() || 0); setDur(p.getDuration() || 0) } catch { /* not ready */ }
      sync()
    }, 1000)
    return () => clearInterval(t)
  }, [sync])

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
          <button type="button" className="icon-btn" aria-label={st.playing ? 'Pause for everyone' : 'Play for everyone'} onClick={() => run(st.playing ? 'pause' : 'play', { pos: here() })}><Icon name={st.playing ? 'pause' : 'play'} size={18} /></button>
          <span className="tiny muted watch-time">{fmtClock(drag ?? cur)}</span>
          <input type="range" min={0} max={Math.max(1, Math.floor(dur))} value={Math.floor(drag ?? cur)} aria-label="Position" onChange={(e) => setDrag(Number(e.target.value))} onPointerUp={() => { if (drag != null) { run('seek', { pos: drag }); setDrag(null) } }} onKeyUp={() => { if (drag != null) { run('seek', { pos: drag }); setDrag(null) } }} />
          <span className="tiny muted watch-time">{fmtClock(dur)}</span>
          <label className="watch-vol"><Icon name="volume" size={16} /><input type="range" min={0} max={100} value={vol} aria-label="Your volume" onChange={(e) => { setVol(Number(e.target.value)); try { player.current?.setVolume(Number(e.target.value)) } catch { /* not ready */ } }} /></label>
        </div>
      )}
      {blocked && <button type="button" className="primary small" onClick={() => { setBlocked(false); try { player.current?.playVideo() } catch { /* ignore */ } sync() }}>Tap to join the playback</button>}
      <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); if (url.trim()) run('load', { url: url.trim() }).then((m) => !m && setUrl('')) }}>
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
function Sketch({ s, run, me }) {
  const cv = useRef(null)
  const mine = useRef(null) // the stroke being drawn right now
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
    for (const k of extra ? [...strokes, extra] : strokes) {
      const p = k.p
      g.strokeStyle = k.c; g.fillStyle = k.c; g.lineWidth = k.w
      if (p.length === 2 || (p.length === 4 && p[0] === p[2] && p[1] === p[3])) { g.beginPath(); g.arc(p[0], p[1], k.w / 2, 0, Math.PI * 2); g.fill(); continue }
      g.beginPath(); g.moveTo(p[0], p[1])
      for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1])
      g.stroke()
    }
  }, [strokes])
  useEffect(() => { paint(mine.current) }, [paint])
  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [Math.round(Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W))), Math.round(Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H)))] }
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); const [x, y] = pt(e); mine.current = { c: color, w: size, p: [x, y] }; paint(mine.current) }
  const move = (e) => { if (!mine.current) return; const [x, y] = pt(e); const p = mine.current.p; if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 3) return; p.push(x, y); paint(mine.current) }
  const up = () => {
    const k = mine.current
    mine.current = null
    if (!k) return
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

/* The panel above the messages. */
export function ActivityDock({ s, me, people, skew, canEnd, onClose, onEnded, reload }) {
  const [err, setErr] = useState('')
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
  const Body = { tictactoe: TicTacToe, connect4: ConnectFour, watch: Watch, sketch: Sketch }[s.kind]
  return (
    <section className="act-dock" aria-label={info.name}>
      <header className="act-dock-head">
        <span className="act-ico"><Icon name={info.icon} size={17} /></span>
        <strong>{info.name}</strong>
        <span className="muted tiny ellipsis">started by {nameOf(people, s.host)}</span>
        <span className="grow" />
        <button type="button" className="ghost small" onClick={onClose}>Hide</button>
        {canEnd && <button type="button" className="ghost small danger" onClick={end}>End</button>}
      </header>
      {err && <div className="error" role="alert">{err}</div>}
      {Body && <Body s={s} me={me} people={people} skew={skew} run={run} />}
    </section>
  )
}
