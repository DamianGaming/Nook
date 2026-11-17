import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { notify } from '../dialog.jsx'
import { Name } from '../cosmetics.jsx'

const friendly = (e) => (/function|schema/i.test(e.message) ? 'Moderation needs the latest database update (update_v21.sql).' : e.message)

const LABEL = {
  timeout: 'timed out', untimeout: 'removed a timeout for', bulk_delete: 'bulk deleted messages from', message_delete: 'deleted a message by',
  channel_create: 'created a channel', channel_delete: 'deleted a channel', channel_rename: 'renamed a channel', group_rename: 'renamed the group',
  join: 'joined', perms: 'changed permissions for', role: 'changed the role of',
}

export function AuditLog({ group, byId }) {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    let on = true
    supabase.from('group_audit').select('*').eq('group_id', group.id).order('created_at', { ascending: false }).limit(60).then(({ data, error }) => {
      if (!on) return
      if (error) { notify(friendly(error), 'error'); setRows([]) } else setRows(data || [])
    })
    return () => { on = false }
  }, [open, group.id])
  const who = (id) => (id && byId[id] ? <Name profile={byId[id]} /> : <span className="muted">someone</span>)
  return (
    <>
      <div className="section">Activity log</div>
      <button type="button" className="ghost small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Hide log' : 'Show recent activity'}</button>
      {open && (rows === null ? <div className="muted tiny">Loading…</div> : rows.length === 0 ? <div className="muted tiny">Nothing logged yet.</div> : (
        <ul className="audit">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{who(r.actor)} {LABEL[r.action] || r.action}{r.target && !/channel|group_rename|join/.test(r.action) ? <> {who(r.target)}</> : null}{r.detail ? <span className="muted"> — {r.detail}</span> : null}</span>
              <time className="muted tiny" dateTime={r.created_at}>{new Date(r.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
            </li>
          ))}
        </ul>
      ))}
    </>
  )
}
