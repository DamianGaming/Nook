import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { inline } from './markdown.jsx'
import { GroupIcon } from './components/Avatar.jsx'
import { notify } from './dialog.jsx'

/* ───────── Embeds people compose themselves ─────────
   Stored inside the message text as  <embed>{json}  (so they work in DMs and stay encrypted there).
   t title · u title link · d description (formatting works) · c colour · i image · th small picture · f footer · fl fields [[name, value], ...] */
export const EMBED_PREFIX = '<embed>'
export const EMBED_MAX = 900
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]{3,300}$/.test(u)
const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '')

export function encodeEmbed(e) {
  const o = {}
  if (e.t) o.t = clip(e.t, 80)
  if (https(e.u)) o.u = e.u
  if (e.d) o.d = clip(e.d, 500)
  if (/^#[0-9a-f]{6}$/i.test(e.c || '')) o.c = e.c
  if (https(e.i)) o.i = e.i
  if (https(e.th)) o.th = e.th
  if (e.f) o.f = clip(e.f, 60)
  const fl = (e.fl || []).filter((x) => x && x[0] && x[1]).slice(0, 4).map((x) => [clip(x[0], 30), clip(x[1], 100)])
  if (fl.length) o.fl = fl
  return EMBED_PREFIX + JSON.stringify(o)
}

export function parseEmbed(text) {
  if (typeof text !== 'string' || !text.startsWith(EMBED_PREFIX)) return null
  try {
    const o = JSON.parse(text.slice(EMBED_PREFIX.length))
    if (!o || typeof o !== 'object') return null
    return {
      t: clip(o.t, 80), u: https(o.u) ? o.u : '', d: clip(o.d, 500), c: /^#[0-9a-f]{6}$/i.test(o.c || '') ? o.c : '', i: https(o.i) ? o.i : '', th: https(o.th) ? o.th : '', f: clip(o.f, 60),
      fl: Array.isArray(o.fl) ? o.fl.slice(0, 4).filter((x) => Array.isArray(x)).map((x) => [clip(x[0], 30), clip(x[1], 100)]) : [],
    }
  } catch { return null }
}

// A short plain-text version for places that cannot show the card (reply previews, search, notifications).
export const embedSummary = (text) => { const e = parseEmbed(text); return e ? `Embed${e.t ? `: ${e.t}` : ''}` : text }

export function EmbedView({ e, ctx }) {
  return (
    <div className="embed" style={{ '--embed': e.c || 'var(--accent)' }}>
      <div className="embed-main">
        {e.t && <div className="embed-title">{e.u ? <a href={e.u} target="_blank" rel="noopener noreferrer nofollow">{e.t}</a> : e.t}</div>}
        {e.d && <div className="embed-desc">{inline(e.d, ctx, 'ed')}</div>}
        {e.fl.length > 0 && (
          <div className="embed-fields">
            {e.fl.map(([n, v], i) => <div key={i}><strong>{inline(n, ctx, `fn${i}`)}</strong><span>{inline(v, ctx, `fv${i}`)}</span></div>)}
          </div>
        )}
        {e.i && <img className="embed-img" src={e.i} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
        {e.f && <div className="embed-foot">{e.f}</div>}
      </div>
      {e.th && <img className="embed-thumb" src={e.th} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
    </div>
  )
}

/* ───────── Group invite links ───────── */
const SITE = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
export const inviteUrl = (code) => `${SITE || (window.nookDesktop ? 'https://nook.app' : location.origin)}/?join=${code}`
const INVITE_RE = /https?:\/\/[^\s<>]+?[?&]join=([A-Za-z0-9]{6,40})(?![A-Za-z0-9])[^\s<>]*/g
export function inviteCodes(text) {
  if (!text || !text.includes('join=')) return []
  return [...new Set([...text.matchAll(INVITE_RE)].map((m) => m[1]))].slice(0, 2)
}
// Is the whole message just invite link(s)? Then the card replaces the link text.
export const onlyInvites = (text) => !!text && text.replace(INVITE_RE, '').trim() === ''

const cache = new Map()
export function InviteCard({ code, onJoined, compact }) {
  const [g, setG] = useState(cache.get(code) ?? undefined) // undefined loading, null invalid
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (cache.has(code)) return undefined
    let live = true
    supabase.rpc('invite_preview', { code }).then(({ data, error }) => {
      if (!live) return
      const row = error ? null : data?.[0] || null
      if (!error) cache.set(code, row)
      setG(row)
    })
    return () => { live = false }
  }, [code])

  async function join() {
    setBusy(true)
    const { data, error } = await supabase.rpc('join_group', { code })
    setBusy(false)
    if (error || !data) return notify(error?.message || 'That invite is no longer valid.', 'error')
    cache.delete(code)
    setG((x) => (x ? { ...x, is_member: true, members: Number(x.members) + 1 } : x))
    onJoined?.(data)
  }

  if (g === undefined) return <div className={`invite-card skel ${compact ? 'compact' : ''}`} aria-busy="true"><span className="skel-line" /></div>
  if (g === null) return <div className={`invite-card bad ${compact ? 'compact' : ''}`}><strong>Invite not valid</strong><span className="muted tiny">It may have expired or been replaced with a new code.</span></div>
  return (
    <div className={`invite-card ${compact ? 'compact' : ''}`} style={g.accent ? { '--invite': g.accent } : undefined}>
      {g.banner_url && <div className="invite-banner" style={{ backgroundImage: `url("${g.banner_url}")` }} />}
      <div className="invite-body">
        <span className="invite-label">You have been invited to join a group</span>
        <div className="invite-row">
          <GroupIcon group={{ name: g.name, icon_emoji: g.icon_emoji, icon_url: g.icon_url }} size={48} />
          <div className="invite-text">
            <strong className="ellipsis">{g.name}</strong>
            <span className="muted tiny">{Number(g.members).toLocaleString()} member{Number(g.members) === 1 ? '' : 's'}</span>
          </div>
          {g.is_member
            ? <button className="ghost" onClick={() => onJoined?.(g.group_id)}>Open</button>
            : <button className="primary" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join'}</button>}
        </div>
        {g.description && <p className="invite-desc">{g.description}</p>}
      </div>
    </div>
  )
}
