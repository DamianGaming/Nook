import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Open the connection to the backend early so the first request is quicker
try {
  const url = import.meta.env.VITE_SUPABASE_URL
  if (url && typeof document !== 'undefined') {
    const l = document.createElement('link')
    l.rel = 'preconnect'
    l.href = url
    l.crossOrigin = ''
    document.head.appendChild(l)
  }
} catch { /* optional */ }
