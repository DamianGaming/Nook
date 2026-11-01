import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { notify } from '../dialog.jsx'
import { modeOfTarget, prefOf, setPref, usePrefsVersion } from '../notifPrefs.js'

const MODES = [
  ['all', 'All messages'],
  ['mentions', 'Only @mentions'],
  ['none', 'Mute'],
]
const FOR = [
  ['1 hour', 3600e3],
  ['8 hours', 8 * 3600e3],
  ['24 hours', 24 * 3600e3],
  ['Until I turn it back on', 0],
]

function until(r) {
  if (!r?.muted_until) return ''
  const d = new Date(r.muted_until)
  return d > new Date() ? `until ${d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''
}

/* The bell in a chat's header: how loudly this chat (and, in a group, the whole group) gets to bother you. */
export default function NotifBell({ userId, target, kind, groupId }) {
  usePrefsVersion()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const pop = useRef(null)
  const mode = modeOfTarget(target)
  const groupMode = groupId ? modeOfTarget(groupId) : 'all'
  const silent = mode === 'none' || (mode === 'all' && groupMode === 'none')

  useEffect(() => {
    if (!open) return undefined
    const down = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    const key = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])

  async function choose(id, k, m, ms = 0) {
    try { await setPref(userId, id, k, m, m === 'none' && ms ? new Date(Date.now() + ms).toISOString() : null) }
    catch (e) { notify(/relation|does not exist|schema/i.test(e.message) ? 'Notification settings need the latest database update (update_v21.sql).' : e.message, 'error') }
  }

  const section = (id, k, title, current) => (
    <div className="nb-sec" role="radiogroup" aria-label={title}>
      <div className="nb-title">{title}</div>
      {MODES.map(([m, label]) => (
        <div key={m}>
          <button role="radio" aria-checked={current === m} className={`nb-row ${current === m ? 'on' : ''}`} onClick={() => (m === 'none' ? null : choose(id, k, m)) || (m === 'none' && choose(id, k, 'none', 0))}>
            <span>{label}{m === 'none' && current === 'none' ? <em className="muted tiny"> {until(prefOf(id))}</em> : null}</span>
            {current === m && <Icon name="check" size={14} />}
          </button>
          {m === 'none' && current !== 'none' && (
            <div className="nb-for">
              {FOR.map(([label2, ms]) => <button key={label2} className="nb-chip" onClick={() => choose(id, k, 'none', ms)}>{label2}</button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <>
      <button ref={btn} className={`icon-btn ${silent ? 'active' : ''}`} title={silent ? 'Notifications muted' : mode === 'mentions' ? 'Notifications: mentions only' : 'Notification settings'} aria-label="Notification settings" aria-expanded={open}
        onClick={() => { const r = btn.current.getBoundingClientRect(); setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }); setOpen((o) => !o) }}>
        <Icon name={silent ? 'bellmute' : 'bell'} size={17} />
      </button>
      {open && pos && (
        <div className="nb-pop" ref={pop} style={{ top: pos.top, right: pos.right }} role="dialog" aria-label="Notification settings">
          {section(target, kind, kind === 'dm' ? 'This conversation' : 'This channel', mode)}
          {groupId && section(groupId, 'group', 'Whole group', groupMode)}
        </div>
      )}
    </>
  )
}
