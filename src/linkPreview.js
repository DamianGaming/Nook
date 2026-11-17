import { supabase } from './supabase.js'

// One request per link per visit. A missing function (not deployed) quietly turns previews off.
const cache = new Map()
let off = false
const URL_RE = /https?:\/\/[^\s<>()]+/i

export const firstLink = (text) => {
  const m = URL_RE.exec(text || '')
  return m ? m[0].replace(/[.,;:!?'"\]]+$/, '') : null
}

export function getPreview(url) {
  if (off) return Promise.resolve(null)
  if (cache.has(url)) return cache.get(url)
  const p = supabase.functions.invoke('link-preview', { body: { url } }).then(({ data, error }) => {
    if (error) { if (!error.context || error.context.status === 404) off = true; return null }
    return data && !data.none && data.title ? data : null
  }, () => null)
  cache.set(url, p)
  if (cache.size > 300) cache.delete(cache.keys().next().value)
  return p
}
