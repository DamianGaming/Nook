import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { claim } from '../mediaFocus.js'
import { audioInfo, isVoiceUrl } from '../upload.js'

const BARS = 44
const RATES = [1, 1.5, 2]
const fmt = (t) => {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const s = Math.floor(t)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
// The bars are drawn from the file's name, so the same message always looks the same without decoding any audio.
function shape(seed) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const out = []
  for (let i = 0; i < BARS; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const wave = 0.5 + 0.5 * Math.sin(i / 3.2 + (h % 7))
    out.push(0.22 + 0.78 * (0.55 * wave + 0.45 * ((h >>> 8) % 100) / 100))
  }
  return out
}

export default function AudioPlayer({ src, voice: voiceProp, title: titleProp, seconds: secondsProp }) {
  const au = useRef(null)
  const track = useRef(null)
  const raf = useRef(0)
  const info = useMemo(() => { const i = audioInfo(src); return { title: titleProp || i.title, seconds: secondsProp || i.seconds } }, [src, titleProp, secondsProp])
  const voice = voiceProp ?? isVoiceUrl(src)
  const bars = useMemo(() => shape(`${info.title}${info.seconds}${src.slice(-12)}`), [src, info])
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(info.seconds || 0)
  const [rate, setRate] = useState(1)
  const [failed, setFailed] = useState(false)

  const tick = () => {
    const a = au.current
    if (a) setTime(a.currentTime)
    raf.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const toggle = () => {
    const a = au.current
    if (!a) return
    if (a.paused) a.play().catch(() => setFailed(true))
    else a.pause()
  }
  const seekTo = (x) => {
    const r = track.current.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (x - r.left) / r.width))
    const a = au.current
    if (a && dur) { a.currentTime = p * dur; setTime(p * dur) }
  }
  const down = (e) => {
    e.preventDefault()
    seekTo(e.clientX)
    const move = (ev) => seekTo(ev.clientX)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onMeta = (e) => {
    const a = e.currentTarget
    if (a.duration === Infinity) {
      // Browser-recorded files have no length written in; asking for the far end makes the browser work it out.
      const fix = () => { a.removeEventListener('timeupdate', fix); if (Number.isFinite(a.duration)) setDur(a.duration); a.currentTime = 0 }
      a.addEventListener('timeupdate', fix)
      a.currentTime = 1e101
    } else if (Number.isFinite(a.duration)) setDur(a.duration)
  }
  const keys = (e) => {
    const a = au.current
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle() }
    else if (e.key === 'ArrowRight') a.currentTime = Math.min(dur, a.currentTime + 5)
    else if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5)
  }
  const pct = dur ? Math.min(100, (time / dur) * 100) : 0

  if (failed) return <div className="ap ap-failed"><Icon name="alert" size={16} /> This audio could not be played. <a href={src} target="_blank" rel="noopener noreferrer">Open it</a></div>

  return (
    <div className={`ap ${voice ? 'voice' : 'file'} ${playing ? 'on' : ''}`}>
      <audio
        ref={au}
        src={src}
        preload="metadata"
        onPlay={() => { claim(au.current); setPlaying(true); cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(tick) }}
        onPause={() => { setPlaying(false); cancelAnimationFrame(raf.current) }}
        onEnded={() => { setPlaying(false); setTime(0); cancelAnimationFrame(raf.current) }}
        onLoadedMetadata={onMeta}
        onError={() => setFailed(true)}
      />
      <button className="ap-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={voice ? 16 : 18} /></button>
      <div className="ap-main">
        {!voice && <div className="ap-title ellipsis">{info.title || 'Audio file'}</div>}
        <div ref={track} className="ap-track" onPointerDown={down} onKeyDown={keys} tabIndex={0} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(time)}>
          <div className="ap-bars" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</div>
          <div className="ap-bars on" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>{bars.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</div>
        </div>
        <div className="ap-meta"><span>{fmt(playing || time ? time : 0)}</span><span className="grow" /><span>{fmt(dur)}</span></div>
      </div>
      <button className="ap-rate" onClick={() => { const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; setRate(r); if (au.current) au.current.playbackRate = r }} aria-label="Playback speed">{rate}x</button>
      {!voice && <a className="ap-dl" href={src} download target="_blank" rel="noopener noreferrer" aria-label="Download"><Icon name="download" size={15} /></a>}
    </div>
  )
}
