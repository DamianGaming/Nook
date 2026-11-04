// Present only inside the Windows app (added by its preload script). On the website this is null.
export const desktop = typeof window !== 'undefined' && window.nookDesktop ? window.nookDesktop : null

// A program's icon (a small PNG as a data address) is saved once under your own media folder, named after its content,
// so the same icon is never uploaded twice. Returns the path to store on the profile.
import { supabase } from './supabase.js'
const stored = new Map()
export async function storeActivityIcon(userId, dataUrl) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{20,20000}$/.test(dataUrl)) return null
  let h = 5381
  for (let i = 0; i < dataUrl.length; i++) h = ((h * 33) ^ dataUrl.charCodeAt(i)) >>> 0
  const path = `${userId}/activity-${h.toString(36)}.png`
  if (stored.has(path)) return path
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
  const { error } = await supabase.storage.from('media').upload(path, new Blob([bytes], { type: 'image/png' }), { contentType: 'image/png', cacheControl: '31536000', upsert: true })
  if (error) return null
  stored.set(path, true)
  return path
}
