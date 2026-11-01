import { supabase } from './supabase.js'

// Web push: lets the browser show message alerts even when Nook is closed.
// Needs VITE_VAPID_PUBLIC_KEY (see WEB_PUSH.md). The desktop app has its own alerts and does not use this.
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
export const pushSupported = () => Boolean(KEY) && !window.nookDesktop && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || window.nookDesktop || !import.meta.env.PROD) return
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

export async function pushEnabled() {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return Boolean(await reg?.pushManager.getSubscription())
  } catch { return false }
}

export async function enablePush(userId) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications are blocked in your browser settings.')
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) }))
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw new Error(/relation|schema/i.test(error.message) ? 'Phone and browser alerts need update_v21.sql to be run first.' : error.message)
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}
