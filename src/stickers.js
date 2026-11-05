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

export const GIF_PAGE = 48
// Returns { items, next } where next is the offset for the following page (or null when there is no more).
export async function searchGifs(q, signal, offset = 0) {
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: String(GIF_PAGE), offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' })
  const url = q ? `https://api.giphy.com/v1/gifs/search?${params}&q=${encodeURIComponent(q)}` : `https://api.giphy.com/v1/gifs/trending?${params}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(res.status === 429 ? 'GIPHY is busy, try again in a minute.' : 'GIF search is not available right now.')
  const json = await res.json()
  // Send a clean address (no tracking parameters): media.giphy.com/media/<id>/giphy.gif
  const items = (json.data || []).map((g) => ({ id: g.id, preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url, url: gifUrl(g.id) })).filter((g) => g.preview && /^[A-Za-z0-9_-]{4,40}$/.test(g.id))
  const total = json.pagination?.total_count ?? 0
  const got = offset + (json.data || []).length
  return { items, next: (json.data || []).length && got < total && got < 500 ? got : null }
}
export const gifUrl = (id) => `https://media.giphy.com/media/${id}/giphy.gif`
export const gifPreview = (url) => url.replace(/\/giphy\.(gif|webp)$/i, '/200w.gif')
export const GIF_CATEGORIES = ['Trending', 'Reactions', 'Happy', 'Funny', 'Love', 'Sad', 'Angry', 'Wow', 'Thumbs up', 'Dance', 'Celebrate', 'Facepalm', 'Thank you', 'Good night', 'Hello', 'Cats', 'Dogs']

// Favourite GIFs live in the database, so they follow you to every device.
let favs = { list: [], loaded: false }
const favSubs = new Set()
const setFavs = (patch) => { favs = { ...favs, ...patch }; favSubs.forEach((f) => f()) }
export const useGifFavorites = () => useSyncExternalStore((f) => { favSubs.add(f); return () => favSubs.delete(f) }, () => favs)
let favLoading = null
export function loadGifFavorites() {
  if (favs.loaded) return Promise.resolve(favs)
  if (!favLoading) favLoading = supabase.from('gif_favorites').select('url, preview').order('created_at', { ascending: false }).limit(300).then(({ data, error }) => {
    favLoading = null
    setFavs({ list: error ? [] : data || [], loaded: true, missing: !!error }) // missing: the v26 update has not been run yet
  })
  return favLoading
}
export async function toggleGifFavorite(url, uid) {
  const has = favs.list.some((f) => f.url === url)
  if (has) {
    setFavs({ list: favs.list.filter((f) => f.url !== url) })
    const { error } = await supabase.from('gif_favorites').delete().eq('url', url)
    if (error) { setFavs({ loaded: false }); loadGifFavorites() }
    return null
  }
  const row = { user_id: uid, url, preview: gifPreview(url) }
  setFavs({ list: [{ url, preview: row.preview }, ...favs.list] })
  const { error } = await supabase.from('gif_favorites').insert(row)
  if (error) { setFavs({ list: favs.list.filter((f) => f.url !== url) }); return error.message.includes('300') ? 'You can keep up to 300 favourite GIFs.' : 'Could not save that favourite. Has the v26 update been run?' }
  return null
}
