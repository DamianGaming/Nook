// Light / dark / follow-the-device theme and a custom accent colour. Kept on this device only.
const KEY = 'nook-theme'
const read = () => { try { return { mode: 'dark', accent: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { mode: 'dark', accent: '' } } }
let state = read()

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, v + amt))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`
}

export function applyTheme() {
  const root = document.documentElement
  const light = state.mode === 'light' || (state.mode === 'system' && matchMedia('(prefers-color-scheme: light)').matches)
  root.dataset.theme = light ? 'light' : 'dark'
  const a = /^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : ''
  for (const v of ['--accent', '--accent-hover', '--accent-text', '--accent-soft', '--accent-deep']) root.style.removeProperty(v)
  if (a) {
    const n = parseInt(a.slice(1), 16)
    root.style.setProperty('--accent', a)
    root.style.setProperty('--accent-hover', shade(a, 18))
    root.style.setProperty('--accent-text', light ? shade(a, -40) : shade(a, 60))
    root.style.setProperty('--accent-soft', `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.16)`)
    root.style.setProperty('--accent-deep', shade(a, -50))
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f5fa' : '#12151e')
}

export const getTheme = () => state
export function setTheme(patch) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ }
  applyTheme()
}
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => state.mode === 'system' && applyTheme()) } catch { /* old browser */ }
applyTheme()
