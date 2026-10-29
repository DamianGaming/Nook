import { supabase } from './supabase.js'

// Sends unexpected crashes to the staff "Errors" tab. Signed-in only, deduplicated, capped per page load.
// Nothing about messages or accounts is attached: just the error text, where it happened and the browser name.
const seen = new Set()
let sent = 0

export async function reportError(err, where = '') {
  try {
    const msg = String(err?.message || err || 'Unknown error').slice(0, 300)
    if (seen.has(msg) || sent >= 10) return
    seen.add(msg)
    if (/ResizeObserver|Script error|Failed to fetch|NetworkError|Load failed|AbortError/i.test(msg)) return
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return
    sent += 1
    await supabase.rpc('log_client_error', {
      msg,
      stack_in: String(err?.stack || '').slice(0, 2000),
      page_in: `${where || ''} ${location.pathname}`.trim().slice(0, 200),
      ua_in: navigator.userAgent.slice(0, 200),
    })
  } catch { /* reporting must never throw */ }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window'))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promise'))
}
