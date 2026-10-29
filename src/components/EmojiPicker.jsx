import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { loadPickerData, useCustomEmoji } from '../emoji.js'
import Icon from './Icon.jsx'

const CATS = [[0, 'Smileys'], [1, 'People'], [3, 'Nature'], [4, 'Food'], [6, 'Activities'], [5, 'Travel'], [7, 'Objects'], [8, 'Symbols'], [9, 'Flags']]
const RECENT_KEY = 'nook-emoji-recent'
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }

/* Emoji button popover: your groups' custom emoji first (they work in DMs too), then every standard emoji. */
export default function EmojiPicker({ onPick, onClose }) {
  const { list } = useCustomEmoji()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('recent')
  const [recent, setRecent] = useState(readRecent)
  const box = useRef(null)

  useEffect(() => { loadPickerData().then(setData) }, [])
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target) && !e.target.closest?.('[data-emoji-btn]')) onClose() }
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [onClose])

  const groups = useMemo(() => {
    const m = new Map()
    list.forEach((e) => { if (!m.has(e.group_id)) m.set(e.group_id, { id: e.group_id, name: e.group_name, items: [] }); m.get(e.group_id).items.push(e) })
    return [...m.values()]
  }, [list])

  function pick(item) {
    const key = item.id ? `c:${item.id}` : `s:${item.c}`
    const next = [key, ...recent.filter((x) => x !== key)].slice(0, 24)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    onPick(item)
  }

  // Typing stays instant; the long result list catches up a moment later.
  const ql = useDeferredValue(q.trim().toLowerCase())
  const byChar = useMemo(() => new Map((data || []).map((e) => [e.c, e])), [data])
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list])
  let body
  if (ql) {
    const cs = list.filter((e) => e.name.includes(ql)).slice(0, 60)
    const ss = (data || []).filter((e) => e.l.includes(ql) || e.t.includes(ql)).slice(0, 120)
    body = [{ title: 'Results', custom: cs, std: ss }]
  } else if (tab === 'recent') {
    const cs = recent.filter((k) => k.startsWith('c:')).map((k) => byId.get(k.slice(2))).filter(Boolean)
    const ss = recent.filter((k) => k.startsWith('s:')).map((k) => byChar.get(k.slice(2))).filter(Boolean)
    body = [{ title: 'Recently used', custom: cs, std: ss }]
  } else if (tab.startsWith('g:')) {
    const g = groups.find((x) => x.id === tab.slice(2))
    body = [{ title: g?.name || 'Group', custom: g?.items || [], std: [] }]
  } else {
    const n = Number(tab.slice(2))
    body = [{ title: CATS.find((c) => c[0] === n)?.[1], custom: [], std: (data || []).filter((e) => e.g === n) }]
  }
  const first = (n) => (data || []).find((e) => e.g === n)?.c
  const empty = body.every((s) => !s.custom.length && !s.std.length)

  return (
    <div className="emoji-picker" ref={box} role="dialog" aria-label="Emoji picker">
      <div className="ep-search"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" aria-label="Search emoji" /></div>
      {!ql && (
        <div className="ep-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'on' : ''} title="Recent" onClick={() => setTab('recent')}><Icon name="clock" size={15} /></button>
          {groups.map((g) => (
            <button role="tab" key={g.id} aria-selected={tab === `g:${g.id}`} className={tab === `g:${g.id}` ? 'on' : ''} title={g.name} onClick={() => setTab(`g:${g.id}`)}>
              <img src={g.items[0].url} alt="" loading="lazy" />
            </button>
          ))}
          {CATS.map(([n, label]) => (
            <button role="tab" key={n} aria-selected={tab === `s:${n}`} className={tab === `s:${n}` ? 'on' : ''} title={label} onClick={() => setTab(`s:${n}`)}>{first(n) || '·'}</button>
          ))}
        </div>
      )}
      <div className="ep-body">
        {!data && !list.length && <div className="muted small ep-empty">Loading…</div>}
        {body.map((s) => (
          <div key={s.title}>
            <div className="ep-title">{s.title}</div>
            {s.custom.length > 0 && <div className="ep-grid">{s.custom.map((e) => <button type="button" key={e.id} className="ep-cell" title={`:${e.name}:`} onClick={() => pick(e)}><img src={e.url} alt={`:${e.name}:`} loading="lazy" decoding="async" /></button>)}</div>}
            {s.std.length > 0 && <div className="ep-grid">{s.std.map((e) => <button type="button" key={e.c} className="ep-cell" title={e.l} onClick={() => pick(e)}>{e.c}</button>)}</div>}
          </div>
        ))}
        {data && empty && <div className="muted small ep-empty">{tab === 'recent' && !ql ? 'Emoji you use will show up here.' : 'Nothing found.'}</div>}
        {!ql && tab === 'recent' && !groups.length && <div className="muted tiny ep-empty">Groups can add their own emoji in group settings. You can use them anywhere, even in DMs.</div>}
      </div>
    </div>
  )
}
