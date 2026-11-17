import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { inline } from './markdown.jsx'
import { GroupIcon } from './components/Avatar.jsx'
import { notify } from './dialog.jsx'
import Icon from './components/Icon.jsx'

/* ───────── Embeds people compose themselves ─────────
   Stored inside the message text as  <embed>{json}  (so they work in DMs and stay encrypted there).
   t title · u title link · d description (formatting works) · c colour · i image · th small picture · f footer · fl fields [[name, value], ...] */
export const EMBED_PREFIX = '<embed>'
export const EMBED_MAX = 1900
export const EMBED_FIELDS = 6
export const EMBED_LINKS = 5
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]{3,300}$/.test(u)
const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '')

// People can add everything a bot can except buttons that need a bot to answer: link buttons only (bl = [[label, https link], ...]).
export function encodeEmbed(e) {
  const o = {}
  if (e.x) o.x = clip(e.x, 500)
  if (e.an) { o.a = { n: clip(e.an, 60) }; if (https(e.ai)) o.a.i = e.ai; if (https(e.au)) o.a.u = e.au }
  if (e.t) o.t = clip(e.t, 120)
  if (https(e.u)) o.u = e.u
  if (e.d) o.d = clip(e.d, 1500)
  if (/^#[0-9a-f]{6}$/i.test(e.c || '')) o.c = e.c
  if (https(e.i)) o.i = e.i
  if (https(e.th)) o.th = e.th
  if (e.f) o.f = clip(e.f, 80)
  if (https(e.fi)) o.fi = e.fi
  if (e.ts) o.ts = new Date().toISOString()
  const fl = (e.fl || []).filter((x) => x && x[0] && x[1]).slice(0, EMBED_FIELDS).map((x) => (x[2] ? [clip(x[0], 40), clip(x[1], 200), 1] : [clip(x[0], 40), clip(x[1], 200)]))
  if (fl.length) o.fl = fl
  const bt = (e.bl || []).filter((x) => x && x[0] && x[1]).slice(0, EMBED_LINKS).map((x) => (https(x[1]) ? ['', clip(x[0], 40), 'link', x[1]] : ['', clip(x[0], 40), 'secondary', '', 0, clip(x[1], 300)]))
  const dl = (e.dl || []).filter((z) => z && z.o && z.o.some((x) => x[0] && x[1])).slice(0, 1)
    .map((z) => ({ id: 'info', ph: clip(z.ph, 60), o: z.o.filter((x) => x[0] && x[1]).slice(0, 25).map((x, i) => [clip(x[0], 60), String(i), clip(x[2], 80), 0, clip(x[1], 300)]) }))
  if (dl.length) o.sl = dl[0]
  if (bt.length) o.bt = bt
  return EMBED_PREFIX + JSON.stringify(o)
}

// Bots may also send: x text above the card · a author {n name, i picture, u link} · fi footer picture · ts time ·
// fl fields [[name, value, inline?]] (up to 6) · bt buttons [[id, label, style, link?]] · sl dropdown {id, ph, o: [[label, value, hint?]]}
const STYLES = ['primary', 'secondary', 'success', 'danger', 'link']
const cid = (x) => typeof x === 'string' && /^[A-Za-z0-9_:.-]{1,64}$/.test(x)
export function parseEmbed(text) {
  if (typeof text !== 'string' || !text.startsWith(EMBED_PREFIX)) return null
  try {
    const o = JSON.parse(text.slice(EMBED_PREFIX.length))
    if (!o || typeof o !== 'object') return null
    const a = o.a && typeof o.a === 'object' ? { n: clip(o.a.n, 60), i: https(o.a.i) ? o.a.i : '', u: https(o.a.u) ? o.a.u : '' } : null
    const bt = Array.isArray(o.bt) ? o.bt.filter((x) => Array.isArray(x) && x[1] && (cid(x[0]) || https(x[3]) || x[5])).slice(0, 10).map((x) => ({ id: cid(x[0]) ? x[0] : '', label: clip(x[1], 40), style: STYLES.includes(x[2]) ? x[2] : 'secondary', url: https(x[3]) ? x[3] : '', off: x[4] === 1, note: typeof x[5] === 'string' ? clip(x[5], 300) : '' })) : []
    const one = (z) => (z && cid(z.id) && Array.isArray(z.o)
      ? { id: z.id, ph: clip(z.ph, 60), min: Math.max(0, Math.min(25, Number(z.mn) || 0)), max: Math.max(1, Math.min(25, Number(z.mx) || 1)), off: z.off === 1, o: z.o.filter((x) => Array.isArray(x) && x[0] && x[1]).slice(0, 25).map((x) => [clip(x[0], 60), clip(x[1], 100), clip(x[2], 80), x[3] ? 1 : 0, typeof x[4] === 'string' ? clip(x[4], 300) : '']) }
      : null)
    const sls = [o.sl, ...(Array.isArray(o.ss) ? o.ss : [])].map(one).filter((z) => z && z.o.length).slice(0, 4)
    let ts = ''
    if (typeof o.ts === 'string' && !Number.isNaN(Date.parse(o.ts))) ts = new Date(o.ts).toISOString()
    return {
      x: clip(o.x, 1000), a, t: clip(o.t, 120), u: https(o.u) ? o.u : '', d: clip(o.d, 1500), c: /^#[0-9a-f]{6}$/i.test(o.c || '') ? o.c : '', i: https(o.i) ? o.i : '', th: https(o.th) ? o.th : '', f: clip(o.f, 80), fi: https(o.fi) ? o.fi : '', ts,
      fl: Array.isArray(o.fl) ? o.fl.slice(0, 6).filter((x) => Array.isArray(x)).map((x) => [clip(x[0], 40), clip(x[1], 200), x[2] ? 1 : 0]) : [],
      bt, sl: sls[0] || null, sls,
    }
  } catch { return null }
}

// A short plain-text version for places that cannot show the card (reply previews, search, notifications).
export const embedSummary = (text) => { const e = parseEmbed(text); return e ? (e.x ? e.x.slice(0, 80) : `Embed${e.t ? `: ${e.t}` : ''}`) : text }

const hasCard = (e) => !!(e.a?.n || e.t || e.d || e.i || e.th || e.f || e.fl.length)

/* A dropdown that looks the same everywhere and opens over the message list (a native <select> closes whenever the chat re-renders). */
function Menu({ z, onPress, busy }) {
  const multi = z.max > 1
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(() => z.o.filter((x) => x[3]).map((x) => x[1]).slice(0, z.max))
  const [act, setAct] = useState(0)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const list = useRef(null)
  const id = useRef('m' + Math.random().toString(36).slice(2, 8)).current
  const disabled = z.off || !onPress || busy
  const close = useCallback(() => setOpen(false), [])
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const room = window.innerHeight - r.bottom
    const h = Math.min(280, z.o.length * 44 + 8)
    const up = room < h + 12 && r.top > room
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8)), width: Math.max(r.width, 240), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }), maxHeight: Math.max(120, Math.min(280, up ? r.top - 16 : room - 16)) })
  }, [open, z.o.length])
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) close() }
    const esc = (e) => { if (e.key === 'Escape') { close(); btn.current?.focus() } }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [open, close])
  useEffect(() => { if (open) list.current?.querySelector('[data-act="1"]')?.scrollIntoView({ block: 'nearest' }) }, [act, open, pos])
  const send = (vals) => { close(); onPress(z.id, vals) }
  const choose = (v) => {
    if (!multi) { setPick([v]); send([v]); return }
    setPick((p) => (p.includes(v) ? p.filter((x) => x !== v) : p.length < z.max ? [...p, v] : p))
  }
  const key = (e) => {
    if (disabled) return
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setAct(Math.max(0, z.o.findIndex((x) => pick.includes(x[1])))); setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((i) => (i + 1) % z.o.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((i) => (i - 1 + z.o.length) % z.o.length) }
    else if (e.key === 'Home') { e.preventDefault(); setAct(0) }
    else if (e.key === 'End') { e.preventDefault(); setAct(z.o.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(z.o[act][1]) }
    else if (e.key === 'Tab') close()
  }
  const chosen = z.o.filter((x) => pick.includes(x[1])).map((x) => x[0])
  const ready = pick.length >= Math.max(1, z.min)
  return (
    <div className="bot-menu">
      <button ref={btn} type="button" className={'bot-select' + (open ? ' open' : '') + (chosen.length ? ' has' : '')} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        aria-label={z.ph || 'Choose an option'} onClick={() => { setAct(Math.max(0, z.o.findIndex((x) => pick.includes(x[1])))); setOpen((o) => !o) }} onKeyDown={key}>
        <span className="bot-select-text">{chosen.length ? chosen.join(', ') : (z.ph || 'Choose…')}</span>
        {busy ? <span className="bot-spin" aria-hidden="true" /> : <Icon name="chevron" size={16} />}
      </button>
      {open && pos && (
        <div ref={list} id={id} className="bot-pop" role="listbox" aria-multiselectable={multi || undefined} style={pos}>
          {z.o.map(([l, v, h], i) => {
            const on = pick.includes(v)
            return (
              <div key={v} role="option" aria-selected={on} data-act={i === act ? '1' : undefined} className={'bot-opt' + (on ? ' on' : '') + (i === act ? ' act' : '')}
                onMouseEnter={() => setAct(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(v)}>
                <span className="bot-opt-main"><b>{l}</b>{h && <small>{h}</small>}</span>
                {on && <Icon name="check" size={16} />}
              </div>
            )
          })}
          {multi && (
            <div className="bot-pop-foot">
              <span className="muted tiny">{pick.length} picked{z.min > 0 ? ` · at least ${z.min}` : ''} · up to {z.max}</span>
              <button type="button" className="primary small" disabled={!ready} onClick={() => send(pick)}>Send</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* Buttons and dropdowns under a bot's message. onPress(customId, pickedValues) is only given where pressing makes sense. */
function Components({ e, onPress }) {
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null) // an answer only this person sees (menus and buttons people build without a bot)
  if (!e.bt.length && !e.sls?.length) return null
  const local = (z) => z.o.some((x) => x[4])
  const pickLocal = (z) => (id, vals) => {
    const opt = z.o.find((x) => x[1] === vals[0])
    if (!opt) return
    if (/^https:\/\//.test(opt[4])) window.open(opt[4], '_blank', 'noopener,noreferrer'); else setNote({ title: opt[0], text: opt[4] })
  }
  const press = async (id, picked) => {
    if (!onPress || busy) return
    setBusy(id)
    try { await onPress(id, picked) } finally { setTimeout(() => setBusy(null), 900) }
  }
  return (
    <div className="bot-ui">
      {e.sls?.map((z) => (local(z) ? <Menu key={z.id} z={z} onPress={pickLocal(z)} /> : <Menu key={z.id} z={z} busy={busy === z.id} onPress={onPress && press} />))}
      {e.bt.length > 0 && (
        <div className="bot-buttons">
          {e.bt.map((b, i) => (b.url
            ? <a key={i} className="bot-btn link" href={b.url} target="_blank" rel="noopener noreferrer nofollow">{b.label}<Icon name="external" size={13} /></a>
            : b.note ? <button key={i} type="button" className={`bot-btn ${b.style}`} onClick={() => setNote({ title: b.label, text: b.note })}>{b.label}</button>
            : <button key={i} type="button" className={`bot-btn ${b.style}`} disabled={b.off || !onPress || !!busy} aria-busy={busy === b.id} onClick={() => press(b.id)}>{busy === b.id && <span className="bot-spin" aria-hidden="true" />}{b.label}</button>))}
        </div>
      )}
      {note && (
        <div className="bot-note" role="status"><div><strong>{note.title}</strong><p>{note.text}</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setNote(null)}><Icon name="x" size={14} /></button></div>
      )}
    </div>
  )
}

export function EmbedView({ e, ctx, onPress }) {
  const when = e.ts ? new Date(e.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
  return (
    <>
      {e.x && <div className="msg-text">{inline(e.x, ctx, 'ex')}</div>}
      {hasCard(e) && (
        <div className="embed" style={{ '--embed': e.c || 'var(--accent)' }}>
          <div className="embed-main">
            {e.a?.n && (
              <div className="embed-author">
                {e.a.i && <img src={e.a.i} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
                {e.a.u ? <a href={e.a.u} target="_blank" rel="noopener noreferrer nofollow">{e.a.n}</a> : <span>{e.a.n}</span>}
              </div>
            )}
            {e.t && <div className="embed-title">{e.u ? <a href={e.u} target="_blank" rel="noopener noreferrer nofollow">{e.t}</a> : e.t}</div>}
            {e.d && <div className="embed-desc">{inline(e.d, ctx, 'ed')}</div>}
            {e.fl.length > 0 && (
              <div className="embed-fields">
                {e.fl.map(([n, v, inl], i) => <div key={i} className={inl ? 'inline' : ''}><strong>{inline(n, ctx, `fn${i}`)}</strong><span>{inline(v, ctx, `fv${i}`)}</span></div>)}
              </div>
            )}
            {e.i && <img className="embed-img" src={e.i} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
            {(e.f || when) && (
              <div className="embed-foot">
                {e.fi && <img src={e.fi} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
                <span>{[e.f, when].filter(Boolean).join(' · ')}</span>
              </div>
            )}
          </div>
          {e.th && <img className="embed-thumb" src={e.th} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
        </div>
      )}
      <Components e={e} onPress={onPress} />
    </>
  )
}

/* ───────── Group invite links ───────── */
const SITE = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
export const inviteUrl = (code) => `${SITE || location.origin}/?join=${code}`
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
