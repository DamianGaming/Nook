// Supabase Edge Function: link-preview
// Fetches a web page for a signed-in person and returns its title, description and picture, so Nook can show a card under a link.
// The fetch happens here, so the people reading the chat never contact the other site themselves.
// Safety: only http(s) on normal ports, no private or local addresses (checked again after every redirect),
// 5 second limit, 512 KB read limit, HTML only. No secrets needed.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600' } })

function privateV4(ip: string) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}
function privateV6(ip: string) {
  const s = ip.toLowerCase()
  if (s === '::' || s === '::1') return true
  if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  return m ? privateV4(m[1]) : false
}

async function safeHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !privateV4(h)
  if (h.includes(':') || h.startsWith('[')) return !privateV6(h.replace(/^\[|\]$/g, ''))
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false // numeric tricks such as http://2130706433
  try {
    const [a, b] = await Promise.all([Deno.resolveDns(h, 'A').catch(() => []), Deno.resolveDns(h, 'AAAA').catch(() => [])])
    if (!a.length && !b.length) return false
    return a.every((ip) => !privateV4(ip)) && b.every((ip) => !privateV6(ip))
  } catch {
    return false
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')
    const tag = re.exec(html)?.[0]
    const c = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1]
    if (c) return decode(c)
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return json({ error: 'Please sign in again.' }, 401)

    const { url } = await req.json().catch(() => ({}))
    if (typeof url !== 'string' || url.length > 500) return json({ error: 'Bad request' }, 400)

    let target: URL
    try { target = new URL(url) } catch { return json({ error: 'Bad link' }, 400) }
    let html = ''
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https?:$/.test(target.protocol) || (target.port && !['80', '443'].includes(target.port)) || target.username || target.password) return json({ none: true })
      if (!(await safeHost(target.hostname))) return json({ none: true })
      const res = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'NookLinkPreview/1.0 (+link card)', Accept: 'text/html,application/xhtml+xml' },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        target = new URL(res.headers.get('location')!, target)
        continue
      }
      if (!res.ok || !(res.headers.get('content-type') || '').toLowerCase().includes('html') || !res.body) return json({ none: true })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let got = 0
      while (got < 512 * 1024) {
        const { done, value } = await reader.read()
        if (done || !value) break
        got += value.length
        html += dec.decode(value, { stream: true })
        if (html.includes('</head>')) break
      }
      reader.cancel().catch(() => {})
      break
    }
    if (!html) return json({ none: true })

    const title = meta(html, ['og:title', 'twitter:title']) || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
    const description = meta(html, ['og:description', 'twitter:description', 'description'])
    let image = meta(html, ['og:image', 'og:image:url', 'twitter:image'])
    try { image = image ? new URL(image, target).href : '' } catch { image = '' }
    if (!/^https:\/\//i.test(image)) image = ''
    const site = meta(html, ['og:site_name']) || target.hostname.replace(/^www\./, '')
    if (!title && !description) return json({ none: true })
    return json({ title: title.slice(0, 120), description: description.slice(0, 220), image, site: site.slice(0, 60), url: target.href })
  } catch (_e) {
    return json({ none: true })
  }
})
