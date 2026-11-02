import { memo, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

// Presence lives in a small external store, so when one person changes status only their own avatars re-render
// (a React context would re-render every avatar on screen).
// Each entry is "status|platforms", for example "online|desktop,web": the colour of the dot, and where they are on.
let map = {}
const subs = new Set()
const setMap = (next) => {
  const prev = map
  map = next
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)])
  ids.forEach((id) => { if (prev[id] !== next[id]) subs.forEach((f) => f(id)) })
}
const subscribeTo = (id) => (cb) => { const f = (changed) => { if (changed === id) cb() }; subs.add(f); return () => subs.delete(f) }
export function usePresenceOf(id) {
  return useSyncExternalStore(subscribeTo(id), () => (id && map[id] ? map[id].split('|')[0] : 'offline'))
}
/* Where someone is on right now, like "desktop,web" (empty when offline). Desktop app, phone/tablet, or website. */
export function usePlatformsOf(id) {
  return useSyncExternalStore(subscribeTo(id), () => (id && map[id] ? map[id].split('|')[1] || '' : ''))
}

export const PLATFORM = {
  desktop: { icon: 'monitor', label: 'Desktop app' },
  mobile: { icon: 'smartphone', label: 'Phone' },
  web: { icon: 'globe', label: 'Website' },
}
const ORDER = ['desktop', 'mobile', 'web']
/* The one to draw: the desktop app first, then phone, then website. */
export const mainPlatform = (list) => ORDER.find((p) => list.includes(p)) || ''

function thisPlatform() {
  if (typeof window === 'undefined') return 'web'
  if (window.nookDesktop) return 'desktop'
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 900) ? 'mobile' : 'web'
}

const IDLE_MS = 5 * 60 * 1000

// Tracks who is online using Supabase Realtime presence.
// "invisible" users simply don't announce themselves. Online users go idle after 5 quiet minutes.
export function PresenceProvider({ userId, status, children }) {
  const [chan, setChan] = useState(null)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let t
    const reset = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), IDLE_MS)
    }
    reset()
    const evs = ['pointerdown', 'keydown', 'touchstart', 'focus']
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(t)
      evs.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [])

  const effective = status === 'online' && idle ? 'idle' : status

  useEffect(() => {
    const ch = supabase.channel('presence:global', { config: { presence: { key: userId } } })
    const sync = () => {
      const next = {}
      for (const [k, arr] of Object.entries(ch.presenceState())) {
        const s = arr[arr.length - 1]?.status
        if (!s || s === 'invisible') continue
        const where = [...new Set(arr.map((x) => x.platform).filter((p) => PLATFORM[p]))]
        next[k] = `${s}|${where.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join(',')}`
      }
      setMap(next)
    }
    ch.on('presence', { event: 'sync' }, sync).subscribe((s) => {
      if (s === 'SUBSCRIBED') setChan(ch)
    })
    return () => {
      setChan(null)
      setMap({})
      supabase.removeChannel(ch)
    }
  }, [userId])

  useEffect(() => {
    if (!chan) return
    if (effective === 'invisible') chan.untrack()
    else chan.track({ status: effective, platform: thisPlatform() })
  }, [chan, effective])

  return children
}
