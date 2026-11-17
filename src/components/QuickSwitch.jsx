import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar, { GroupIcon } from './Avatar.jsx'
import Icon from './Icon.jsx'

/* Ctrl+K (or Cmd+K): jump to any group or message thread by typing part of its name. */
export default function QuickSwitch({ groups, dms, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const list = useRef(null)
  const items = useMemo(() => {
    const all = [
      ...groups.map((g) => ({ key: 'g' + g.id, label: g.name, kind: 'Group', view: { type: 'group', id: g.id }, group: g })),
      ...dms.filter((d) => d.other).map((d) => ({ key: 'd' + d.id, label: d.other.display_name || d.other.username, sub: '@' + d.other.username, kind: 'Message', view: { type: 'dm', id: d.id }, person: d.other })),
    ]
    const t = q.trim().toLowerCase()
    if (!t) return all.slice(0, 12)
    const score = (i) => { const l = i.label.toLowerCase(); const u = (i.sub || '').toLowerCase(); return l.startsWith(t) ? 0 : l.includes(t) ? 1 : u.includes(t) ? 2 : 9 }
    return all.map((i) => [score(i), i]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label)).map(([, i]) => i).slice(0, 12)
  }, [q, groups, dms])
  useEffect(() => setSel(0), [q])
  useEffect(() => { list.current?.children[sel]?.scrollIntoView({ block: 'nearest' }) }, [sel])
  function key(e) {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); onPick(items[sel].view) }
  }
  return (
    <div className="overlay qs-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal qs" role="dialog" aria-label="Jump to">
        <div className="qs-input">
          <Icon name="search" size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Jump to a group or person" aria-label="Jump to a group or person" role="combobox" aria-expanded="true" aria-controls="qs-list" />
          <kbd>Esc</kbd>
        </div>
        <ul id="qs-list" className="qs-list" role="listbox" ref={list}>
          {items.map((i, n) => (
            <li key={i.key} role="option" aria-selected={n === sel}>
              <button type="button" className={n === sel ? 'on' : ''} onMouseMove={() => setSel(n)} onClick={() => onPick(i.view)}>
                {i.group ? <GroupIcon group={i.group} size={28} /> : <Avatar profile={i.person} size={28} />}
                <span className="qs-name">{i.label}{i.sub && <small className="muted"> {i.sub}</small>}</span>
                <span className="qs-kind">{i.kind}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="qs-empty muted">{q.trim() ? `Nothing matches "${q.trim()}".` : "No groups or chats yet."}</li>}
        </ul>
        <div className="qs-foot muted tiny"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span></div>
      </div>
    </div>
  )
}
