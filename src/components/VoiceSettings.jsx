import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modals.jsx'
import Icon from './Icon.jsx'
import { usePrefs, setPrefs } from '../prefs.js'
import { play } from '../sounds.js'
import { useCall } from '../call/CallProvider.jsx'

const canPickOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

function useDevices() {
  const [list, setList] = useState({ audioinput: [], audiooutput: [], videoinput: [] })
  const [labelled, setLabelled] = useState(true)
  const refresh = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const by = (k) => all.filter((d) => d.kind === k)
      setList({ audioinput: by('audioinput'), audiooutput: by('audiooutput'), videoinput: by('videoinput') })
      setLabelled(all.every((d) => d.label) || all.length === 0)
    } catch { /* no media devices */ }
  }
  useEffect(() => {
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [])
  return { list, labelled, refresh }
}

function DeviceSelect({ label, devices, value, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Default</option>
        {devices.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>
        ))}
      </select>
    </label>
  )
}

/* Live input level so you can see your microphone working. Only runs while you press Test. */
function MicTest({ deviceId, noise, echo, agc, onPermission }) {
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [heard, setHeard] = useState(false)
  const [loop, setLoop] = useState(false)
  const [label, setLabel] = useState('')
  const bar = useRef(null)
  // The parent passes a new function every render; keeping it in a ref stops the test restarting itself.
  const permRef = useRef(onPermission)
  permRef.current = onPermission

  useEffect(() => {
    if (!on) return undefined
    let stream
    let ctx
    let raf = 0
    let dead = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined, noiseSuppression: noise, echoCancellation: echo, autoGainControl: agc },
        })
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return }
        setLabel(stream.getAudioTracks()[0]?.label || '')
        permRef.current?.()
        const AC = window.AudioContext || window.webkitAudioContext
        ctx = new AC()
        await ctx.resume().catch(() => {})
        const src = ctx.createMediaStreamSource(stream)
        const an = ctx.createAnalyser()
        an.fftSize = 1024
        src.connect(an)
        if (loop) {
          // Hear yourself. Best with headphones, otherwise it will feed back.
          const g = ctx.createGain()
          g.gain.value = 0.8
          src.connect(g)
          g.connect(ctx.destination)
        }
        const buf = new Float32Array(an.fftSize)
        let level = 0
        let last = 0
        let loud = 0
        const tick = (t) => {
          raf = requestAnimationFrame(tick)
          if (t - last < 33) return
          last = t
          an.getFloatTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
          const rms = Math.sqrt(sum / buf.length)
          const target = Math.min(1, Math.pow(rms * 6, 0.7))
          level = target > level ? target : level * 0.86 + target * 0.14
          if (bar.current) bar.current.style.transform = `scaleX(${level})`
          if (level > 0.12 && ++loud === 4) setHeard(true)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setErr(e?.name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser settings and try again.' : e?.name === 'NotFoundError' ? 'No microphone was found.' : 'Could not use that microphone. Try another input device.')
        setOn(false)
      }
    })()
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
      if (bar.current) bar.current.style.transform = 'scaleX(0)'
    }
  }, [on, deviceId, noise, echo, agc, loop])

  return (
    <div className="mic-test">
      <div className="row tight">
        <button type="button" className="ghost small" onClick={() => { setErr(''); setHeard(false); setOn((v) => !v) }}>
          <Icon name={on ? 'micoff' : 'mic'} size={14} /> {on ? 'Stop test' : 'Test microphone'}
        </button>
        {on && <label className="mic-loop"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Hear myself</label>}
      </div>
      <div className="meter" aria-hidden="true"><i ref={bar} /></div>
      {on && <span className={`tiny ${heard ? 'ok-text' : 'muted'}`}>{heard ? `Your microphone is working${label ? `: ${label}` : ''}.` : 'Say something. The bar should move.'}</span>}
      {err && <span className="error-text tiny">{err}</span>}
    </div>
  )
}

function Switch({ label, hint, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>{label}{hint && <span className="muted tiny">{hint}</span>}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function VoiceSettingsBody() {
  const p = usePrefs()
  const call = useCall()
  const { list, labelled, refresh } = useDevices()
  return (
    <div className="form settings-form">
        {!labelled && (
          <div className="info-box">
            <span>Allow microphone access to see the names of your devices.</span>
            <button type="button" className="ghost small" onClick={async () => {
              try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()) } catch { /* denied */ }
              refresh()
            }}>Allow</button>
          </div>
        )}

        <div className="section">Microphone</div>
        <DeviceSelect label="Input device" devices={list.audioinput} value={p.inputId} onChange={(v) => setPrefs({ inputId: v })} />
        <MicTest deviceId={p.inputId} noise={p.noise} echo={p.echo} agc={p.agc} onPermission={refresh} />
        <Switch label="Noise suppression" hint="Cuts background noise like fans and keyboards." checked={p.noise} onChange={(v) => setPrefs({ noise: v })} />
        <Switch label="Echo cancellation" hint="Stops others hearing themselves. Keep on unless you wear headphones." checked={p.echo} onChange={(v) => setPrefs({ echo: v })} />
        <Switch label="Automatic volume" hint="Keeps your voice at a steady level." checked={p.agc} onChange={(v) => setPrefs({ agc: v })} />

        <div className="section">Speakers</div>
        {canPickOutput && <DeviceSelect label="Output device" devices={list.audiooutput} value={p.outputId} onChange={(v) => setPrefs({ outputId: v })} />}
        <label>
          Call volume <span className="muted tiny">{Math.round(p.outVolume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={p.outVolume} onChange={(e) => setPrefs({ outVolume: Number(e.target.value) })} />
        </label>

        <div className="section">Camera</div>
        <DeviceSelect label="Camera" devices={list.videoinput} value={p.camId} onChange={(v) => setPrefs({ camId: v })} />

        <div className="section">Screen sharing</div>
        <div className="choice-list" role="radiogroup" aria-label="Screen share quality">
          {[['light', 'Light', '720p, easy on slow connections'], ['balanced', 'Balanced', '720p, smooth motion'], ['sharp', 'Sharp', '1080p, smooth motion'], ['detail', 'Detail', '1080p, best for text and slides']].map(([id, name, hint]) => (
            <button type="button" key={id} role="radio" aria-checked={p.shareQuality === id} className={`choice ${p.shareQuality === id ? 'on' : ''}`} onClick={() => setPrefs({ shareQuality: id })}>
              <strong>{name}</strong><span className="muted tiny">{hint}</span>
            </button>
          ))}
        </div>
        <Switch label="Share sound too" hint="Works for tabs, and for whole screens in some browsers." checked={p.shareAudio} onChange={(v) => setPrefs({ shareAudio: v })} />

        <div className="section">Sounds</div>
        <Switch label="Call and app sounds" hint="Join, leave, mute, deafen, screen share and ringing." checked={p.sounds} onChange={(v) => setPrefs({ sounds: v })} />
        <label>
          Sound volume <span className="muted tiny">{Math.round(p.soundVolume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={p.soundVolume} disabled={!p.sounds}
            onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) })} onPointerUp={() => play('join')} />
        </label>
        <div className="row tight">
          {['join', 'leave', 'mute', 'message'].map((n) => (
            <button type="button" key={n} className="ghost small" disabled={!p.sounds} onClick={() => play(n)}>{n[0].toUpperCase() + n.slice(1)}</button>
          ))}
        </div>

        {call?.active && <p className="muted tiny">Changes apply to your current call straight away. Settings stay on this device.</p>}
    </div>
  )
}

export default function VoiceSettings({ onClose }) {
  return (
    <Modal title="Voice and video" onClose={onClose}>
      <VoiceSettingsBody />
      <div className="modal-foot"><button className="primary" onClick={onClose}>Done</button></div>
    </Modal>
  )
}
