import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const MAX_SECONDS = 300
const BARS = 28
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/* Records from the microphone. Send hands back a File and its length; Cancel throws the recording away. */
export default function VoiceRecorder({ onSend, onCancel, onError }) {
  const [secs, setSecs] = useState(0)
  const [ready, setReady] = useState(false)
  const rec = useRef(null)
  const chunks = useRef([])
  const stream = useRef(null)
  const started = useRef(0)
  const bars = useRef([])
  const stopAction = useRef('send')
  const ctx = useRef(null)
  const raf = useRef(0)

  function cleanup() {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    ctx.current?.close().catch(() => {})
    stream.current = null
    ctx.current = null
  }

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Voice messages are not supported in this browser.')
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        if (dead) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
        const r = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined)
        rec.current = r
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
        r.onstop = () => {
          const seconds = (Date.now() - started.current) / 1000
          const mime = (r.mimeType || type || 'audio/webm').split(';')[0]
          const action = stopAction.current
          cleanup()
          if (action === 'cancel') return onCancel()
          if (seconds < 0.6) { onError('That was too short. Hold on a little longer.'); return onCancel() }
          const blob = new Blob(chunks.current, { type: mime })
          onSend(new File([blob], `voice.${mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'weba'}`, { type: mime }), seconds)
        }
        r.start(500)
        started.current = Date.now()
        setReady(true)
        // level meter: a light analyser read about 15 times a second, drawn straight onto the bars
        const AC = window.AudioContext || window.webkitAudioContext
        if (AC) {
          const ac = new AC()
          ctx.current = ac
          const an = ac.createAnalyser()
          an.fftSize = 256
          ac.createMediaStreamSource(s).connect(an)
          const buf = new Uint8Array(an.frequencyBinCount)
          let last = 0
          const loop = (t) => {
            raf.current = requestAnimationFrame(loop)
            if (t - last < 66) return
            last = t
            an.getByteTimeDomainData(buf)
            let sum = 0
            for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
            const level = Math.min(1, Math.sqrt(sum / buf.length) * 4)
            bars.current.push(level)
            if (bars.current.length > BARS) bars.current.shift()
            const els = document.querySelectorAll('.vr-bars i')
            const off = BARS - bars.current.length
            els.forEach((el, i) => { el.style.transform = `scaleY(${0.12 + 0.88 * (bars.current[i - off] || 0)})` })
          }
          raf.current = requestAnimationFrame(loop)
        }
      } catch (e) {
        cleanup()
        onError(e.name === 'NotAllowedError' ? 'Allow microphone access in your browser to record a voice message.' : e.name === 'NotFoundError' ? 'No microphone was found.' : e.message || 'Could not start recording.')
        onCancel()
      }
    })()
    return () => { dead = true; if (rec.current && rec.current.state !== 'inactive') { stopAction.current = 'cancel'; rec.current.stop() } else cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready) return undefined
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000
      setSecs(s)
      if (s >= MAX_SECONDS) finish('send')
    }, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  function finish(action) {
    stopAction.current = action
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
    else onCancel()
  }
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') finish('cancel') }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="composer recording" role="group" aria-label="Recording a voice message">
      <button type="button" className="icon-btn" onClick={() => finish('cancel')} aria-label="Cancel recording" title="Cancel"><Icon name="trash" size={18} /></button>
      <span className="vr-dot" aria-hidden="true" />
      <span className="vr-time" aria-live="off">{fmt(secs)}</span>
      <span className="vr-bars" aria-hidden="true">{Array.from({ length: BARS }, (_, i) => <i key={i} />)}</span>
      <span className="muted tiny vr-hint">{ready ? 'Recording' : 'Waiting for microphone'}</span>
      <button type="button" className="send" onClick={() => finish('send')} disabled={!ready} aria-label="Send voice message"><Icon name="send" size={16} /></button>
    </div>
  )
}
