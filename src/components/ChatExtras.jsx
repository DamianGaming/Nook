import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import { Name } from '../cosmetics.jsx'
import { Modal } from './Modals.jsx'
import { encodePoll, POLL_MAX_OPTIONS } from '../poll.js'

/* A poll card. res = { counts: number[], mine: number | null } */
export function PollView({ poll, res, onVote, preview = false }) {
  const counts = poll.o.map((_, i) => res?.counts?.[i] || 0)
  const total = counts.reduce((a, b) => a + b, 0)
  const mine = res?.mine ?? null
  const top = total ? Math.max(...counts) : -1
  return (
    <div className="poll" role="group" aria-label={`Poll: ${poll.q}`}>
      <div className="poll-q"><Icon name="chart" size={15} /><span>{poll.q}</span></div>
      <div className="poll-opts">
        {poll.o.map((label, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0
          return (
            <button key={i} type="button" disabled={preview} className={`poll-opt${mine === i ? ' mine' : ''}${counts[i] === top ? ' lead' : ''}`} role="radio" aria-checked={mine === i} onClick={() => onVote?.(mine === i ? null : i)}>
              <span className="poll-bar" style={{ transform: `scaleX(${pct / 100})` }} />
              <span className="poll-dot" aria-hidden="true">{mine === i && <Icon name="check" size={12} />}</span>
              <span className="poll-label">{label}</span>
              <span className="poll-n"><b>{pct}%</b><small>{counts[i]}</small></span>
            </button>
          )
        })}
      </div>
      <div className="poll-foot muted tiny">
        <span>{total} {total === 1 ? 'vote' : 'votes'}</span>
        <span>{mine === null ? 'Pick one' : 'Press your choice again to undo'}</span>
      </div>
    </div>
  )
}

export function PollBuilder({ onSend, onClose }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const refs = useRef([])
  const clean = opts.map((x) => x.trim()).filter(Boolean)
  const ok = q.trim() && clean.length >= 2
  const add = () => { setOpts((x) => (x.length < POLL_MAX_OPTIONS ? [...x, ''] : x)); setTimeout(() => refs.current[opts.length]?.focus(), 0) }
  return (
    <Modal title="Create a poll" onClose={onClose}>
      <form className="form poll-build" onSubmit={(e) => { e.preventDefault(); if (ok) { onSend(encodePoll(q, clean)); onClose() } }}>
        <label className="pb-field">Question <span className="pb-count">{q.length}/200</span>
          <input value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="What should we play tonight?" autoFocus />
        </label>
        <div className="pb-head"><span>Options</span><span className="muted tiny">{opts.length} of {POLL_MAX_OPTIONS}</span></div>
        <div className="pb-opts">
          {opts.map((o, i) => (
            <div className="pb-row" key={i}>
              <span className="pb-num" aria-hidden="true">{i + 1}</span>
              <input ref={(el) => { refs.current[i] = el }} value={o} maxLength={80} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
                onChange={(e) => setOpts((x) => x.map((v, n) => (n === i ? e.target.value : v)))}
                onKeyDown={(e) => { if (e.key === 'Enter' && i === opts.length - 1 && o.trim() && opts.length < POLL_MAX_OPTIONS) { e.preventDefault(); add() } }} />
              <button type="button" className="icon-btn" aria-label={`Remove option ${i + 1}`} disabled={opts.length <= 2} onClick={() => setOpts((x) => x.filter((_, n) => n !== i))}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
        {opts.length < POLL_MAX_OPTIONS && <button type="button" className="ghost small pb-add" onClick={add}><Icon name="plus" size={14} /> Add an option</button>}
        {ok && (
          <div className="pb-preview">
            <div className="section">Preview</div>
            <PollView poll={{ q: q.trim(), o: clean }} preview />
          </div>
        )}
        <div className="pb-foot"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={!ok}>Post poll</button></div>
      </form>
    </Modal>
  )
}

/* Replies to one message, shown beside the chat. `live` is what the chat already holds. */
export function ThreadPanel({ root, live, authors, ensureAuthors, renderText, onSend, onOpenProfile, onClose }) {
  const [fetched, setFetched] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)

  useEffect(() => {
    let on = true
    setFetched(null)
    supabase.from('messages').select('*').eq('reply_to', root.id).order('created_at', { ascending: true }).limit(200).then(async ({ data }) => {
      if (!on) return
      await ensureAuthors((data || []).map((m) => m.author_id))
      if (on) setFetched(data || [])
    })
    return () => { on = false }
  }, [root.id, ensureAuthors])

  const list = useMemo(() => {
    const seen = new Map()
    for (const m of [...(fetched || []), ...live]) seen.set(m.id, m)
    return [...seen.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [fetched, live])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [list.length])

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onSend(root, text)
    setBusy(false)
    if (ok) setText('')
  }
  const ra = authors[root.author_id]
  return (
    <aside className="thread-panel" aria-label="Thread">
      <div className="pins-head">
        <strong><Icon name="message" size={14} /> Thread</strong>
        <button className="icon-btn" aria-label="Close thread" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      <div className="thread-list">
        <div className="thread-root">
          <div className="pin-meta"><Avatar profile={ra} size={22} /><strong>{ra ? <Name profile={ra} /> : 'Someone'}</strong><span className="muted tiny">{new Date(root.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
          <div className="msg-text">{renderText(root)}</div>
        </div>
        {fetched === null && <div className="muted small pad">Loading…</div>}
        {fetched && list.length === 0 && <div className="muted small pad">No replies yet. Start the conversation below.</div>}
        {list.map((m) => {
          const a = authors[m.author_id]
          return (
            <div key={m.id} className="thread-msg">
              <button className="plain" onClick={() => a && onOpenProfile(a)} aria-label="Open profile"><Avatar profile={a} size={26} /></button>
              <div>
                <div className="pin-meta"><strong>{a ? <Name profile={a} /> : '…'}</strong><span className="muted tiny">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="msg-text">{renderText(m)}</div>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form className="thread-input row nowrap" onSubmit={submit}>
        <input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Reply in thread" aria-label="Reply in thread" />
        <button className="primary small" disabled={!text.trim() || busy}>Send</button>
      </form>
    </aside>
  )
}
