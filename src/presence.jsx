import { memo, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

// Presence lives in a small external store, so when one person changes status only their own avatars re-render
// (a React context would re-render every avatar on screen).
let map = {}
const subs = new Set()
const setMap = (next) => {
  const prev = map
  map = next
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)])
  ids.forEach((id) => { if (prev[id] !== next[id]) subs.forEach((f) => f(id)) })
}
export function usePresenceOf(id) {
  return useSyncExternalStore(
    (cb) => { const f = (changed) => { if (changed === id) cb() }; subs.add(f); return () => subs.delete(f) },
    () => (id ? map[id] || 'offline' : 'offline')
  )
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
        if (s && s !== 'invisible') next[k] = s
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
    else chan.track({ status: effective })
  }, [chan, effective])

  return children
}
