import { useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

// Stickers are big pictures a group adds (like custom emoji). A sticker message is just "<s:id:name>".
export const STICKER_RE = /^<s:([0-9a-f-]{36}):([a-z0-9_]{2,32})>$/
export const stickerToken = (s) => `<s:${s.id}:${s.name}>`

let state = { list: [], byId: new Map(), loaded: false }
const subs = new Set()
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
export const useStickers = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)

let loading = null
export function loadStickers(force = false) {
  if (state.loaded && !force) return Promise.resolve(state)
  if (loading && !force) return loading
  loading = supabase.from('group_stickers').select('id, name, url, group_id, groups(name)').order('name').then(({ data, error }) => {
    loading = null
    if (error) { set({ loaded: true }); return state } // the database may not be updated yet
    const list = (data || []).map((s) => ({ id: s.id, name: s.name, url: s.url, group_id: s.group_id, group_name: s.groups?.name || 'Group' }))
    const byId = new Map(state.byId)
    list.forEach((s) => byId.set(s.id, s))
    set({ list, byId, loaded: true })
    return state
  }, () => { loading = null; set({ loaded: true }); return state })
  return loading
}

// Stickers sent from groups you are not in: look them up by exact id.
const asking = new Set()
export function resolveStickers(ids) {
  const need = ids.filter((id) => !state.byId.has(id) && !asking.has(id))
  if (!need.length) return
  need.forEach((id) => asking.add(id))
  supabase.rpc('stickers_by_ids', { ids: need }).then(({ data }) => {
    const byId = new Map(state.byId)
    ;(data || []).forEach((s) => byId.set(s.id, s))
    need.forEach((id) => { if (!byId.has(id)) byId.set(id, { id, name: '', url: null, missing: true }) })
    set({ byId })
  }, () => {})
}

// GIFs: a message whose whole text is a picture link from Tenor or Giphy shows as the picture.
export const GIF_RE = /^https:\/\/(?:media\d?\.tenor\.com|c\.tenor\.com|media\d*\.giphy\.com)\/\S{4,300}\.(?:gif|webp)$/i
export const TENOR_KEY = import.meta.env.VITE_TENOR_KEY || ''

export async function searchGifs(q, signal) {
  const base = 'https://tenor.googleapis.com/v2'
  const params = new URLSearchParams({ key: TENOR_KEY, client_key: 'nook', limit: '24', media_filter: 'tinygif,gif', contentfilter: 'medium' })
  const url = q ? `${base}/search?${params}&q=${encodeURIComponent(q)}` : `${base}/featured?${params}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('GIF search is not available right now.')
  const json = await res.json()
  return (json.results || []).map((r) => ({ id: r.id, preview: r.media_formats?.tinygif?.url, url: r.media_formats?.gif?.url })).filter((g) => g.preview && g.url && GIF_RE.test(g.url))
}
