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

// GIFs: a message whose whole text is a picture link from GIPHY shows as the picture.
export const GIF_RE = /^https:\/\/media\d*\.giphy\.com\/media\/[A-Za-z0-9_-]{4,40}\/(?:giphy|200w|200)\.(?:gif|webp)$/i
export const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY || ''

export async function searchGifs(q, signal) {
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: '24', rating: 'pg-13', bundle: 'messaging_non_clips' })
  const url = q ? `https://api.giphy.com/v1/gifs/search?${params}&q=${encodeURIComponent(q)}` : `https://api.giphy.com/v1/gifs/trending?${params}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(res.status === 429 ? 'GIPHY is busy, try again in a minute.' : 'GIF search is not available right now.')
  const json = await res.json()
  // Send a clean address (no tracking parameters): media.giphy.com/media/<id>/giphy.gif
  return (json.data || []).map((g) => ({ id: g.id, preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url, url: `https://media.giphy.com/media/${g.id}/giphy.gif` })).filter((g) => g.preview && /^[A-Za-z0-9_-]{4,40}$/.test(g.id))
}
