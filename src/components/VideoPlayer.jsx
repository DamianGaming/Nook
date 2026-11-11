import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const SPEEDS = [0.5, 1, 1.25, 1.5, 2]
import { claim } from '../mediaFocus.js'

const fmt = (t) => {
  if (!Number.isFinite(t)) return '0:00'
  const s = Math.floor(t)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export default function VideoPlayer({ src, onReady, name }) {
  const wrap = useRef(null)
  const vid = useRef(null)
  const bar = useRef(null)
  const hideT = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [menu, setMenu] = useState(false)
  const [full, setFull] = useState(false)
  const [awake, setAwake] = useState(true)
  const [ratio, setRatio] = useState(16 / 9)
  const [failed, setFailed] = useState(false)
  const [seeking, setSeeking] = useState(false)

  const wake = () => {
    setAwake(true)
    clearTimeout(hideT.current)
    hideT.current = setTimeout(() => setAwake(false), 2400)
  }
  useEffect(() => () => clearTimeout(hideT.current), [])
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === wrap.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const toggle = () => {
    const v = vid.current
    if (!v) return
    wrap.current?.focus({ preventScroll: true })
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }
  const onPlay = () => {
    claim(vid.current)
    setPlaying(true)
    wake()
  }
  const seekTo = (clientX) => {
    const r = bar.current.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    if (vid.current && dur) vid.current.currentTime = p * dur
    setTime(p * dur)
  }
  const startSeek = (e) => {
    e.preventDefault()
    setSeeking(true)
    seekTo(e.clientX)
    const move = (ev) => seekTo(ev.clientX)
    const up = () => { setSeeking(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const goFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else if (wrap.current.requestFullscreen) wrap.current.requestFullscreen().catch(() => {})
    else vid.current?.webkitEnterFullscreen?.()
  }
  const pip = () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture?.()
    else vid.current?.requestPictureInPicture?.().catch(() => {})
  }
  const setRate = (r) => { setSpeed(r); if (vid.current) vid.current.playbackRate = r; setMenu(false) }

  function onKey(e) {
    const v = vid.current
    if (!v || e.target.closest('input')) return
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'k') toggle()
    else if (k === 'arrowright' || k === 'l') v.currentTime = Math.min(dur, v.currentTime + 5)
    else if (k === 'arrowleft' || k === 'j') v.currentTime = Math.max(0, v.currentTime - 5)
    else if (k === 'arrowup') { v.volume = Math.min(1, v.volume + 0.1); v.muted = false }
    else if (k === 'arrowdown') v.volume = Math.max(0, v.volume - 0.1)
    else if (k === 'm') v.muted = !v.muted
    else if (k === 'f') goFull()
    else return
    e.preventDefault()
    wake()
  }

  const pct = dur ? (time / dur) * 100 : 0
  const quiet = playing && !awake && !seeking && !menu

  if (failed) {
    return (
      <div className="vp vp-failed">
        <Icon name="alert" size={18} /> This video could not be played.
        <a href={src} target="_blank" rel="noopener noreferrer">Open it</a>
      </div>
    )
  }

  return (
    <div
      ref={wrap}
      className={`vp ${playing ? 'playing' : ''} ${quiet ? 'quiet' : ''} ${full ? 'full' : ''}`}
      style={{ aspectRatio: full ? undefined : ratio }}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={wake}
      onPointerLeave={() => playing && setAwake(false)}
      role="group"
      aria-label="Video player"
    >
      <video
        ref={vid}
        src={`${src}#t=0.1`}
        preload="metadata"
        playsInline
        onClick={toggle}
        onDoubleClick={goFull}
        onPlay={onPlay}
        onPause={() => { setPlaying(false); setAwake(true) }}
        onEnded={() => { setPlaying(false); setAwake(true) }}
        onTimeUpdate={(e) => !seeking && setTime(e.currentTarget.currentTime)}
        onProgress={(e) => { const v = e.currentTarget; if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) }}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted) }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          setDur(v.duration)
          if (v.videoWidth && v.videoHeight) setRatio(Math.min(Math.max(v.videoWidth / v.videoHeight, 0.5), 2.4))
          onReady?.()
        }}
        onError={() => setFailed(true)}
      />
      {!playing && (
        <button className="vp-big" onClick={toggle} aria-label="Play"><Icon name="play" size={28} /></button>
      )}
      <div className="vp-bar">
        <div ref={bar} className="vp-seek" onPointerDown={startSeek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(time)}>
          <span className="vp-buf" style={{ transform: `scaleX(${dur ? buffered / dur : 0})` }} />
          <span className="vp-fill" style={{ transform: `scaleX(${pct / 100})` }} />
          <span className="vp-knob" style={{ left: `${pct}%` }} />
        </div>
        <div className="vp-row">
          <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
          <span className="vp-time">{fmt(time)} <i>/</i> {fmt(dur)}</span>
          <span className="grow" />
          <span className="vp-vol">
            <button onClick={() => { if (vid.current) vid.current.muted = !vid.current.muted }} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted || volume === 0 ? 'volumex' : 'volume'} size={16} /></button>
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => { const v = vid.current; v.volume = Number(e.target.value); v.muted = false }} />
          </span>
          <span className="vp-speed">
            <button onClick={() => setMenu((m) => !m)} aria-label="Playback speed" aria-expanded={menu}>{speed}x</button>
            {menu && (
              <div className="vp-menu" role="menu">
                {SPEEDS.map((r) => <button key={r} role="menuitemradio" aria-checked={r === speed} className={r === speed ? 'on' : ''} onClick={() => setRate(r)}>{r === 1 ? 'Normal' : `${r}x`}</button>)}
              </div>
            )}
          </span>
          {document.pictureInPictureEnabled && <button onClick={pip} aria-label="Picture in picture"><Icon name="pip" size={16} /></button>}
          <a className="vp-dl" href={src} download={name || true} target="_blank" rel="noopener noreferrer" aria-label="Download"><Icon name="download" size={16} /></a>
          <button onClick={goFull} aria-label={full ? 'Exit full screen' : 'Full screen'}><Icon name={full ? 'minimize' : 'maximize'} size={16} /></button>
        </div>
      </div>
    </div>
  )
}
