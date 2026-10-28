import { useSyncExternalStore } from 'react'

// Per-device voice, video and sound settings, kept in this browser only.
const KEY = 'nook-voice-prefs'
export const DEFAULTS = {
  sounds: true,        // call and message sounds
  soundVolume: 0.6,    // 0 to 1
  outVolume: 1,        // volume of other people, 0 to 1
  inputId: '',
  outputId: '',
  camId: '',
  noise: true,         // noise suppression
  echo: true,          // echo cancellation
  agc: true,           // automatic gain
  shareQuality: 'balanced', // balanced | sharp | detail
  shareAudio: true,
}

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

let state = load()
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }

export const getPrefs = () => state
export function setPrefs(patch) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ }
  subs.forEach((f) => f())
}
export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs)
