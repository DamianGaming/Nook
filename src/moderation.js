import { supabase } from './supabase.js'
import { confirmDialog, notify } from './dialog.jsx'

// Right-click menu entries for moderating one member. Only the entries you are allowed to use are returned.
const TIMEOUTS = [['5 minutes', 5], ['1 hour', 60], ['1 day', 1440], ['1 week', 10080]]
const CLEANUPS = [['the last hour', 1], ['the last 24 hours', 24], ['the last 7 days', 168]]
const friendly = (e) => (/function|schema/i.test(e.message) ? 'Moderation needs the latest database update (update_v21.sql).' : e.message)

export function modItems({ groupId, member, name, canMembers, canMessages, onDone }) {
  if (!groupId || !member || member.role === 'founder') return []
  const out = []
  const timedOut = member.timeout_until && new Date(member.timeout_until) > new Date()
  if (canMembers && member.role === 'member') {
    const set = async (minutes) => {
      const { error } = await supabase.rpc('timeout_member', { gid: groupId, uid: member.user_id, minutes })
      if (error) return notify(friendly(error), 'error')
      notify(minutes ? `${name} was timed out.` : `${name} can post again.`)
      onDone?.()
    }
    out.push({ label: 'Time out', icon: 'clock', children: TIMEOUTS.map(([l, m]) => ({ label: l, onClick: () => set(m) })) })
    if (timedOut) out.push({ label: 'Remove timeout', icon: 'check', onClick: () => set(0) })
  }
  if (canMessages) {
    const wipe = async (hours, label) => {
      if (!(await confirmDialog({ title: `Delete ${name}'s messages?`, body: `Everything they posted in this group in ${label} will be removed. This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return
      const { data, error } = await supabase.rpc('bulk_delete_messages', { gid: groupId, uid: member.user_id, hours })
      if (error) return notify(friendly(error), 'error')
      notify(`Deleted ${data ?? 0} message${data === 1 ? '' : 's'}.`)
      onDone?.()
    }
    out.push({ label: 'Delete their messages', icon: 'trash', danger: true, children: CLEANUPS.map(([l, h]) => ({ label: l.replace(/^the /, 'Last ').replace('Last last', 'Last'), danger: true, onClick: () => wipe(h, l) })) })
  }
  return out
}
