// Supabase Edge Function: livekit-token
// Checks that the signed-in user is allowed in a call room, then hands back a short-lived LiveKit token.
// Rooms: a DM (only its two people) or a group's voice room (only members of that group).
// Secrets needed: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
// (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const enc = new TextEncoder()
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// LiveKit access tokens are plain HS256 JWTs, so no SDK is needed.
async function signToken(apiKey: string, apiSecret: string, claims: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(sig)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('LIVEKIT_URL')
    const apiKey = Deno.env.get('LIVEKIT_API_KEY')
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
    if (!url || !apiKey || !apiSecret) return json({ error: 'Calls are not set up yet.' }, 503)

    // Everything below runs as the caller, so the database's own security rules decide what they may see.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    const user = userData?.user
    if (userErr || !user) return json({ error: 'Please sign in again.' }, 401)

    const { kind, id } = await req.json().catch(() => ({}))
    if ((kind !== 'dm' && kind !== 'channel' && kind !== 'group') || typeof id !== 'string' || id.length > 64) {
      return json({ error: 'Bad request' }, 400)
    }

    let room: string
    if (kind === 'dm') {
      const { data: dm } = await supabase.from('dms').select('id, user_a, user_b').eq('id', id).maybeSingle()
      if (!dm) return json({ error: 'You are not allowed in this call.' }, 403)
      const { data: blocked } = await supabase.rpc('is_blocked_between', { a: dm.user_a, b: dm.user_b })
      if (blocked) return json({ error: 'You cannot call this person.' }, 403)
      room = `dm_${dm.id}`
    } else if (kind === 'group') {
      // One voice room per group; the groups table is only readable by its members.
      const { data: g } = await supabase.from('groups').select('id').eq('id', id).maybeSingle()
      if (!g) return json({ error: 'You are not allowed in this call.' }, 403)
      room = `gr_${g.id}`
    } else {
      const { data: ch } = await supabase.from('channels').select('id').eq('id', id).maybeSingle()
      if (!ch) return json({ error: 'You are not allowed in this call.' }, 403)
      room = `ch_${ch.id}`
    }

    const { data: p } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url, accent_color, frame, frame_color, name_color2, name_font')
      .eq('id', user.id)
      .maybeSingle()

    const now = Math.floor(Date.now() / 1000)
    const token = await signToken(apiKey, apiSecret, {
      iss: apiKey,
      sub: user.id,
      name: p?.display_name || p?.username || 'Someone',
      metadata: JSON.stringify({ a: p?.avatar_url ?? null, c: p?.accent_color ?? null, f: p?.frame ?? null, fc: p?.frame_color ?? null, n2: p?.name_color2 ?? null, nf: p?.name_font ?? null }),
      nbf: now - 10,
      exp: now + 2 * 60 * 60,
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: true },
    })
    return json({ token, url })
  } catch (_e) {
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
