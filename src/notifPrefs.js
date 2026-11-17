import { useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

// Per-chat notification settings: "all", "mentions" or "none" (muted, optionally for a set time).
// A channel or DM setting wins over its group's. Kept in a small store so only what changed redraws.
let prefs = new Map() // target id -> { target, kind, mode, muted_until }
let version = 0
const subs = new Set()
const emit = () => { version++; subs.forEach((f) => f()) }
export const usePrefsVersion = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => version)

export async function loadPrefs() {
  const { data, error } = await supabase.from('notif_prefs').select('*')
  if (error) return // the table is added by update_v21.sql; before that everything simply stays on
  prefs = new Map((data || []).map((r) => [r.target, r]))
  emit()
}

const effective = (r) => {
  if (!r) return null
  if (r.mode === 'none' && r.muted_until && new Date(r.muted_until).getTime() <= Date.now()) return null // the timed mute is over
  return r.mode
}
export const prefOf = (target) => prefs.get(target) || null
export const modeOfTarget = (target) => effective(prefs.get(target)) || 'all'
/* The mode that applies to a message: the chat's own setting, else its group's, else "all". */
export function modeOf({ channelId, groupId, dmId }) {
  return effective(prefs.get(channelId || dmId)) || effective(prefs.get(groupId)) || 'all'
}

export async function setPref(userId, target, kind, mode, mutedUntil = null) {
  const before = prefs.get(target)
  if (mode === 'all') prefs.delete(target)
  else prefs.set(target, { user_id: userId, target, kind, mode, muted_until: mutedUntil })
  emit()
  const { error } = mode === 'all'
    ? await supabase.from('notif_prefs').delete().eq('target', target)
    : await supabase.from('notif_prefs').upsert({ user_id: userId, target, kind, mode, muted_until: mutedUntil })
  if (error) { // put it back
    if (before) prefs.set(target, before); else prefs.delete(target)
    emit()
    throw error
  }
}
