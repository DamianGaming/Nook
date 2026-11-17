import { getPrefs } from './prefs.js'

// Every sound is synthesised with the browser's audio engine, so there are no files to download.
// Each sound is a list of [frequency Hz, start seconds, length seconds, type?, gain?].
const PATTERNS = {
  join: [[523, 0, 0.14], [784, 0.11, 0.2]],
  leave: [[784, 0, 0.14], [523, 0.11, 0.22]],
  peerJoin: [[659, 0, 0.12], [880, 0.09, 0.16]],
  peerLeave: [[587, 0, 0.12], [440, 0.09, 0.16]],
  mute: [[330, 0, 0.09, 'triangle']],
  unmute: [[494, 0, 0.09, 'triangle']],
  deafen: [[330, 0, 0.1, 'triangle'], [220, 0.08, 0.14, 'triangle']],
  undeafen: [[330, 0, 0.1, 'triangle'], [494, 0.08, 0.14, 'triangle']],
  shareStart: [[587, 0, 0.1], [740, 0.08, 0.1], [988, 0.16, 0.16]],
  shareStop: [[988, 0, 0.1], [740, 0.08, 0.1], [587, 0.16, 0.16]],
  error: [[247, 0, 0.14, 'triangle'], [196, 0.12, 0.22, 'triangle']],
  declined: [[494, 0, 0.12], [392, 0.12, 0.12], [294, 0.24, 0.22]],
  message: [[880, 0, 0.07, 'sine', 0.6], [1175, 0.05, 0.1, 'sine', 0.5]],
  ring: [[659, 0, 0.3], [880, 0.22, 0.3]],
  ringback: [[440, 0, 0.35, 'sine', 0.6], [554, 0.4, 0.35, 'sine', 0.6]],
}

let ctx
function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume?.().catch(() => {})
  return ctx
}

// Browsers keep audio locked until the person has interacted with the page once.
if (typeof window !== 'undefined') {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function play(name, { force = false } = {}) {
  const p = getPrefs()
  if (!force && !p.sounds) return
  const pattern = PATTERNS[name]
  const c = audio()
  if (!pattern || !c) return
  const vol = Math.max(0, Math.min(1, p.soundVolume)) * 0.22
  if (vol <= 0) return
  const now = c.currentTime + 0.01
  for (const [f, at, len, type = 'sine', gain = 1] of pattern) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = f
    o.connect(g)
    g.connect(c.destination)
    g.gain.setValueAtTime(0.0001, now + at)
    g.gain.exponentialRampToValueAtTime(vol * gain, now + at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + len)
    o.start(now + at)
    o.stop(now + at + len + 0.05)
  }
}

// Repeats a sound until stopped (incoming ring, outgoing ringback). Returns the stop function.
export function loop(name, everyMs, opts) {
  play(name, opts)
  const t = setInterval(() => play(name, opts), everyMs)
  return () => clearInterval(t)
}
