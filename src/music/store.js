import { useSyncExternalStore } from 'react'

// State shared by the music player (which runs for as long as you are in a call) and the music panel.
// Mute and volume are yours alone and are remembered on this device.
const KEY = 'nook-music'
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()

let state = {
  open: false,
  muted: Boolean(saved.muted),
  volume: typeof saved.volume === 'number' ? saved.volume : 70,
  room: null,        // { id, kind }
  items: [],
  current: null,     // id of the song that is playing
  startedAt: null,
  skew: 0,           // server clock minus this device's clock, in ms
  blocked: false,    // the browser stopped playback until you tap
  error: '',
  titles: {},        // titles learned from the player for songs added without one
  loaded: false,
}
const subs = new Set()
export const getMusic = () => state
export function setMusic(patch) {
  state = { ...state, ...patch }
  if ('muted' in patch || 'volume' in patch) { try { localStorage.setItem(KEY, JSON.stringify({ muted: state.muted, volume: state.volume })) } catch { /* private mode */ } }
  subs.forEach((f) => f())
}
export const useMusic = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, getMusic)

// The player registers what the panel's "tap to start" button should do.
export const musicActions = { resume: null }
