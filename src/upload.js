import { supabase } from './supabase.js'

const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const VIDEOS = ['video/mp4', 'video/webm', 'video/quicktime']
const AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm']
export const MAX_MB = 8
export const MAX_VIDEO_MB = 50
export const ACCEPT_MEDIA = [...IMAGES, ...VIDEOS, ...AUDIO, 'audio/mp3', 'audio/x-m4a', 'audio/x-wav', '.mp3', '.m4a', '.wav', '.ogg', '.aac'].join(',')
const EXT = { 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'weba' }
const ALIAS = { 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'video/x-m4v': 'video/mp4' }
const BY_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', aac: 'audio/aac', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }

export const isVideoUrl = (url) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '')
export const isAudioUrl = (url) => /\.(mp3|m4a|aac|ogg|wav|weba)(\?|$)/i.test(url || '')
export const isVoiceUrl = (url) => /\/voice-\d+[^/]*\.\w+(\?|$)/i.test(url || '')
// "chat-1700000000-my-song.mp3" -> "my song"; voice messages carry their length as "-d12" (seconds).
export function audioInfo(url) {
  const file = decodeURIComponent((url || '').split('/').pop() || '').replace(/\?.*$/, '')
  const m = /^(?:chat|voice)-\d+(?:-d(\d+))?(?:-(.+))?\.\w+$/.exec(file)
  return { title: m?.[2] ? m[2].replace(/-/g, ' ') : '', seconds: m?.[1] ? Number(m[1]) : 0 }
}

function kindOf(file) {
  const raw = (file.type || '').split(';')[0].toLowerCase()
  const type = ALIAS[raw] || raw || BY_EXT[(file.name || '').split('.').pop().toLowerCase()] || ''
  return type
}

// Checks type and size. Returns { type, kind: 'image' | 'video' | 'audio' } or throws a friendly error.
export function checkMedia(file, { video = false } = {}) {
  const type = kindOf(file)
  const isVideo = VIDEOS.includes(type)
  const isAudio = AUDIO.includes(type)
  if (!IMAGES.includes(type) && !(video && (isVideo || isAudio))) {
    throw new Error(video ? 'Please use an image, an MP4, WebM or MOV video, or an MP3, M4A, WAV or OGG audio file.' : 'Please use a PNG, JPG, GIF or WebP image.')
  }
  const limit = isVideo || isAudio ? MAX_VIDEO_MB : MAX_MB
  if (file.size > limit * 1024 * 1024) throw new Error(`${isVideo ? 'Video' : isAudio ? 'Audio' : 'Image'} must be under ${limit} MB.`)
  return { type, kind: isVideo ? 'video' : isAudio ? 'audio' : 'image' }
}

const MAX_SIDE = { avatar: 512, group: 512, banner: 1600 }
// Shrinks very large pictures before upload (faster to send, faster to load). Animated GIF / WebP are never touched,
// and the original is kept whenever resizing would not make it smaller.
async function shrink(file, type, kind) {
  if (type === 'image/gif' || !IMAGES.includes(type) || typeof createImageBitmap === 'undefined') return file
  const limit = MAX_SIDE[kind] || 2048
  try {
    if (type === 'image/webp') {
      const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
      if (new TextDecoder().decode(head).includes('ANIM')) return file
    }
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, limit / Math.max(bmp.width, bmp.height))
    if (scale === 1) { bmp.close?.(); return file }
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise((res) => canvas.toBlob(res, type === 'image/png' ? 'image/png' : type, 0.88))
    return out && out.size < file.size ? new File([out], file.name, { type }) : file
  } catch { return file }
}

// Uploads the picture (shrunk if huge) or the original file, so animated GIF / WebP stay animated.
// Profile pictures, banners and group icons are images only; chat attachments may also be video and audio.
export async function uploadMedia(userId, file, kind, { video = false, seconds = 0 } = {}) {
  const { type, kind: mk } = checkMedia(file, { video })
  if (mk === 'image') file = await shrink(file, type, kind)
  const isAudio = mk === 'audio'
  const ext = EXT[type] || type.split('/')[1]
  // Audio keeps a readable name (and a voice message its length) in the file name itself, so no extra database column is needed.
  const slug = isAudio && kind !== 'voice' ? `-${(file.name || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` : ''
  const dur = kind === 'voice' && seconds ? `-d${Math.round(seconds)}` : ''
  const path = `${userId}/${kind}-${Date.now()}${dur}${slug === '-' ? '' : slug}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, file, {
    contentType: type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

export async function removeMedia(url) {
  try {
    const part = url?.split('/object/public/media/')[1]
    if (part) await supabase.storage.from('media').remove([decodeURIComponent(part)])
  } catch {
    /* best effort */
  }
}
