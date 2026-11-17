// Supabase Edge Function: send-push
// Sends a browser / desktop notification for every new message to the people who are not looking at it.
// Called by a Database Webhook on INSERT into public.messages (see WEB_PUSH.md for the 5-minute setup).
// Secrets needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com), PUSH_WEBHOOK_SECRET.
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
//
// Privacy: messages in encrypted DMs (they start with "e1.") are never readable here, so those notifications
// only say "New message". Everything else shows the sender and the first part of the text.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SEALED = 'e1.'
const url = Deno.env.get('SUPABASE_URL')!
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 })
  let body: any
  try { body = await req.json() } catch { return new Response('bad json', { status: 400 }) }
  const m = body?.record
  if (body?.type !== 'INSERT' || !m?.author_id) return new Response('ignored')

  const { data: author } = await db.from('profiles').select('username, display_name').eq('id', m.author_id).maybeSingle()
  const who = author?.display_name || author?.username || 'Someone'
  const text: string = typeof m.content === 'string' ? m.content : ''
  const sealed = text.startsWith(SEALED)
  const snippet = sealed ? 'New message' : clip(text.replace(/\s+/g, ' ').trim() || (m.attachments?.length ? 'Sent an attachment' : 'New message'), 120)

  let recipients: string[] = []
  let target = ''
  let kind: 'dm' | 'channel' = 'dm'
  let title = who
  let link = '/'
  let groupId = ''

  if (m.dm_id) {
    const { data: dm } = await db.from('dms').select('user_a, user_b').eq('id', m.dm_id).maybeSingle()
    if (!dm) return new Response('no dm')
    recipients = [dm.user_a, dm.user_b].filter((u) => u !== m.author_id)
    target = m.dm_id
  } else if (m.channel_id) {
    kind = 'channel'
    const { data: ch } = await db.from('channels').select('name, group_id, groups(name)').eq('id', m.channel_id).maybeSingle()
    if (!ch) return new Response('no channel')
    groupId = ch.group_id
    target = m.channel_id
    title = `${who} · #${ch.name} · ${(ch as any).groups?.name || ''}`.replace(/ · $/, '')
    const { data: mem } = await db.from('group_members').select('user_id').eq('group_id', ch.group_id)
    recipients = (mem || []).map((r) => r.user_id).filter((u) => u !== m.author_id)
  } else return new Response('ignored')
  if (!recipients.length) return new Response('nobody')

  // Respect each person's notification settings: everything / only mentions / nothing, and "muted until".
  const { data: prefs } = await db.from('notif_prefs').select('user_id, target, mode, muted_until').in('user_id', recipients).in('target', [target, groupId].filter(Boolean))
  const { data: profs } = await db.from('profiles').select('id, username').in('id', recipients)
  const nameOf = new Map((profs || []).map((p) => [p.id, (p.username || '').toLowerCase()]))
  const now = Date.now()
  const lowered = text.toLowerCase()
  const wanted = recipients.filter((uid) => {
    const mine = (prefs || []).filter((p) => p.user_id === uid)
    const own = mine.find((p) => p.target === target) || mine.find((p) => p.target === groupId)
    if (!own) return true
    if (own.muted_until && new Date(own.muted_until).getTime() > now) return false
    if (own.mode === 'none') return false
    if (own.mode === 'mentions') {
      const u = nameOf.get(uid)
      return Boolean(u) && (lowered.includes(`@${u}`) || lowered.includes('@everyone') || lowered.includes('@here'))
    }
    return true
  })
  if (!wanted.length) return new Response('all muted')

  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', wanted)
  const payload = JSON.stringify({ title: clip(title, 80), body: snippet, tag: `${kind}-${target}`, kind, target, url: link })
  const dead: string[] = []
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'normal' })
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id)
    }
  }))
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead)
  return new Response(`sent ${(subs?.length || 0) - dead.length}`)
})
