import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import Icon from './Icon.jsx'
import { Name } from '../cosmetics.jsx'
import { decodeCustom } from '../emoji.js'

/* The list of pinned messages for a chat. */
export default function PinsPanel({ col, val, ids, view, authors, ensureAuthors, onJump, canPin, onUnpin, onClose }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let live = true
    if (!ids.length) { setItems([]); return undefined }
    supabase.from('messages').select('*').in('id', ids).eq(col, val).then(async ({ data }) => {
      const list = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      await ensureAuthors(list.map((m) => m.author_id))
      if (live) setItems(list)
    })
    return () => { live = false }
  }, [ids, col, val, ensureAuthors])

  return (
    <div className="pins-pop" role="dialog" aria-label="Pinned messages">
      <div className="pins-head">
        <strong><Icon name="pin" size={14} /> Pinned messages</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      {items === null && <div className="muted small pad">Loading…</div>}
      {items && items.length === 0 && <div className="muted small pad">Nothing is pinned here yet. Hover a message and press the pin to keep it handy.</div>}
      <div className="pins-list">
        {(items || []).map((m) => {
          const a = authors[m.author_id]
          const text = decodeCustom(view(m).text || '')
          return (
            <div key={m.id} className="pin-item">
              <div className="pin-meta"><strong>{a ? <Name profile={a} /> : 'Someone'}</strong><span className="muted tiny">{new Date(m.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span></div>
              <div className="pin-text">{text || (m.attachment_url ? 'Attachment' : '')}</div>
              <div className="row tight">
                <button className="ghost small" onClick={() => { onJump(m); onClose() }}>Jump to message</button>
                {canPin && <button className="ghost small" onClick={() => onUnpin(m)}>Unpin</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
