import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { confirmDialog, notify } from '../dialog.jsx'
import { Name } from '../cosmetics.jsx'

const TIMEOUTS = [['5 min', 5], ['1 hour', 60], ['1 day', 1440], ['1 week', 10080]]
const CLEANUPS = [['Last hour', 1], ['Last 24 h', 24], ['Last 7 days', 168]]

const friendly = (e) => (/function|schema/i.test(e.message) ? 'Moderation needs the latest database update (update_v21.sql).' : e.message)

// Timeout + "delete recent messages" controls for one member row.
export function ModTools({ group, member, canMembers, canMessages, onDone }) {
  const [busy, setBusy] = useState(false)
  const until = member.timeout_until && new Date(member.timeout_until) > new Date() ? new Date(member.timeout_until) : null
  const run = async (p, ok) => {
    setBusy(true)
    const { data, error } = await p
    setBusy(false)
    if (error) return notify(friendly(error), 'error')
    notify(typeof ok === 'function' ? ok(data) : ok)
    onDone?.()
  }
  const timeout = (minutes) => run(supabase.rpc('timeout_member', { gid: group.id, uid: member.user_id, minutes }), minutes ? 'Timed out.' : 'Timeout removed.')
  const wipe = async (hours, label) => {
    if (!(await confirmDialog({ title: 'Delete their recent messages?', body: `Everything they posted in this group in the ${label.toLowerCase()} will be removed. This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return
    run(supabase.rpc('bulk_delete_messages', { gid: group.id, uid: member.user_id, hours }), (n) => `Deleted ${n ?? 0} message${n === 1 ? '' : 's'}.`)
  }
  return (
    <div className="modtools" role="group" aria-label="Moderation">
      {canMembers && member.role === 'member' && (
        <div className="row tight wrap">
          <span className="muted tiny">{until ? `Timed out until ${until.toLocaleString()}` : 'Timeout'}</span>
          {TIMEOUTS.map(([l, m]) => <button key={m} type="button" className="ghost small" disabled={busy} onClick={() => timeout(m)}>{l}</button>)}
          {until && <button type="button" className="ghost small" disabled={busy} onClick={() => timeout(0)}>Clear</button>}
        </div>
      )}
      {canMessages && member.role !== 'founder' && (
        <div className="row tight wrap">
          <span className="muted tiny">Delete messages</span>
          {CLEANUPS.map(([l, h]) => <button key={h} type="button" className="ghost small danger" disabled={busy} onClick={() => wipe(h, l)}>{l}</button>)}
        </div>
      )}
    </div>
  )
}

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
