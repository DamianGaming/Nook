// :shortcode: support. The dictionary (GitHub-style names, ~45 KB) loads the first time someone types a colon.
let dict = null
let loading = null

export function loadEmoji() {
  if (dict) return Promise.resolve(dict)
  loading ||= import('emojibase-data/en/shortcodes/github.json').then((m) => {
    const map = new Map()
    for (const [hex, names] of Object.entries(m.default || m)) {
      const char = String.fromCodePoint(...hex.split('-').map((h) => parseInt(h, 16)))
      for (const n of [].concat(names)) map.set(n, char)
    }
    dict = map
    return map
  }).catch(() => { loading = null; return new Map() })
  return loading
}

export const emojiReady = () => dict

// Swaps every complete :name: for its emoji. Unknown names are left alone.
export function replaceShortcodes(text) {
  if (!dict || !text.includes(':')) return text
  return text.replace(/:([a-z0-9_+-]{1,40}):/gi, (all, n) => dict.get(n.toLowerCase()) || all)
}

// What the person is typing right now: ":smi" just before the caret.
export function openShortcode(text, caret) {
  const m = /(^|[\s(])(:[a-z0-9_+-]{2,40})$/i.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length, query: m[2].slice(1).toLowerCase() } : null
}

export function searchEmoji(query, limit = 8) {
  if (!dict) return []
  const starts = []
  const has = []
  for (const [n, c] of dict) {
    if (n.startsWith(query)) starts.push([n, c])
    else if (has.length < limit && n.includes(query)) has.push([n, c])
    if (starts.length >= limit) break
  }
  return [...starts, ...has].slice(0, limit)
}

/* ───────────── Custom emoji (made by groups, usable everywhere) ─────────────
   In the box you type :name: like any emoji. When the message is sent, it is stored as <e:ID:name>, so it still
   shows for people who are not in that group (for example in a DM). */
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

let custom = { list: [], byId: new Map(), loaded: false } // list: [{id, name, url, group_id, group_name}]
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const set = (patch) => { custom = { ...custom, ...patch }; emit() }
export const useCustomEmoji = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => custom)
export const customEmoji = () => custom

let loadingCustom = null
export function loadCustomEmoji(force = false) {
  if (custom.loaded && !force) return Promise.resolve(custom)
  if (loadingCustom && !force) return loadingCustom
  loadingCustom = supabase.from('group_emojis').select('id, name, url, group_id, groups(name)').order('name').then(({ data, error }) => {
    loadingCustom = null
    if (error) { set({ loaded: true }); return custom } // the database may not be updated yet
    const list = (data || []).map((e) => ({ id: e.id, name: e.name, url: e.url, group_id: e.group_id, group_name: e.groups?.name || 'Group' }))
    const byId = new Map(custom.byId)
    list.forEach((e) => byId.set(e.id, e))
    set({ list, byId, loaded: true })
    return custom
  }, () => { loadingCustom = null; set({ loaded: true }); return custom })
  return loadingCustom
}

// Emoji used in messages from groups you are not in: look them up by exact id.
const asking = new Set()
export function resolveCustom(ids) {
  const need = ids.filter((id) => !custom.byId.has(id) && !asking.has(id))
  if (!need.length) return
  need.forEach((id) => asking.add(id))
  supabase.rpc('emoji_by_ids', { ids: need }).then(({ data }) => {
    const byId = new Map(custom.byId)
    ;(data || []).forEach((e) => byId.set(e.id, e))
    need.forEach((id) => { if (!byId.has(id)) byId.set(id, { id, name: '', url: null, missing: true }) })
    set({ byId })
  }, () => {})
}

export const CUSTOM_TOKEN = /<e:([0-9a-f-]{36}):([a-z0-9_]{2,32})>/g

// Turns typed :name: into <e:ID:name>. `picked` remembers which group's emoji was chosen when two groups share a name.
export function encodeCustom(text, { prefer, picked } = {}) {
  if (!custom.list.length || !text.includes(':')) return text
  return text.replace(/:([a-z0-9_]{2,32}):/g, (all, n) => {
    const same = custom.list.filter((e) => e.name === n)
    if (!same.length) return all
    const e = same.find((x) => x.id === picked?.get(n)) || same.find((x) => x.group_id === prefer) || same[0]
    return `<e:${e.id}:${e.name}>`
  })
}

export function searchCustom(query, limit = 8) {
  const q = query.toLowerCase()
  return custom.list.filter((e) => e.name.includes(q)).sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q))).slice(0, limit)
}

// Pictures of emoji for the picker: loaded only when the picker opens (about 570 KB, cached by the browser).
let pickerData = null
export function loadPickerData() {
  pickerData ||= import('emojibase-data/en/compact.json').then((m) => (m.default || m).filter((e) => e.group !== undefined && e.group !== 2).map((e) => ({ c: e.unicode, l: e.label, g: e.group, t: (e.tags || []).join(' ') }))).catch(() => { pickerData = null; return [] })
  return pickerData
}

// The reverse, for editing a message: <e:ID:name> becomes :name: again (and remembers which emoji it was).
export function decodeCustom(text, picked) {
  return text.replace(CUSTOM_TOKEN, (all, id, name) => { picked?.set(name, id); return `:${name}:` })
}
