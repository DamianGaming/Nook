import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { loadPickerData, pickerIndex, useCustomEmoji } from '../emoji.js'
import Icon from './Icon.jsx'

const CATS = [[0, 'Smileys'], [1, 'People'], [3, 'Nature'], [4, 'Food'], [6, 'Activities'], [5, 'Travel'], [7, 'Objects'], [8, 'Symbols'], [9, 'Flags']]
const RECENT_KEY = 'nook-emoji-recent'
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }

// A grid of emoji. One click handler for the whole grid (not one per emoji), and long lists draw their first
// screenful straight away and the rest a moment later, so opening a big category never stalls.
const Grid = memo(function Grid({ items, custom, onPick, onHover }) {
  const [n, setN] = useState(custom ? items.length : 72)
  useEffect(() => {
    if (n >= items.length) return undefined
    const id = requestAnimationFrame(() => setN(items.length))
    return () => cancelAnimationFrame(id)
  }, [n, items.length])
  const find = (e) => {
    const b = e.target.closest?.('.ep-cell')
    return b ? items[Number(b.dataset.i)] : null
  }
  return (
    <div className="ep-grid" onClick={(e) => { const it = find(e); if (it) onPick(it) }} onMouseOver={(e) => onHover(find(e))}>
      {items.slice(0, n).map((e, i) => (custom
        ? <button type="button" key={e.id} data-i={i} className="ep-cell" aria-label={`:${e.name}:`}><img src={e.url} alt="" loading="lazy" decoding="async" /></button>
        : <button type="button" key={e.c} data-i={i} className="ep-cell" aria-label={e.l}>{e.c}</button>))}
    </div>
  )
})

/* Emoji button popover: your groups' custom emoji first (they work in DMs too), then every standard emoji. */
export default function EmojiPicker({ onPick, onClose }) {
  const { list } = useCustomEmoji()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('recent')
  const [recent, setRecent] = useState(readRecent)
  const box = useRef(null)
  const hint = useRef(null)
  const showHint = useCallback((it) => { if (hint.current) hint.current.textContent = it ? (it.id ? `:${it.name}:` : `${it.c}  ${it.l}`) : '' }, [])

  useEffect(() => { if (pickerIndex) setData(pickerIndex.list); else loadPickerData().then(setData) }, [])
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

  const pick = useCallback((item) => {
    const key = item.id ? `c:${item.id}` : `s:${item.c}`
    const next = [key, ...recent.filter((x) => x !== key)].slice(0, 24)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    onPick(item)
  }, [recent, onPick])

  // Typing stays instant; the long result list catches up a moment later.
  const ql = useDeferredValue(q.trim().toLowerCase())
  const byChar = pickerIndex?.byChar
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list])
  const body = useMemo(() => {
    if (ql) return [{ title: 'Results', custom: list.filter((e) => e.name.includes(ql)).slice(0, 60), std: (data || []).filter((e) => e.s.includes(ql)).slice(0, 120) }]
    if (tab === 'recent') {
      return [{
        title: 'Recently used',
        custom: recent.filter((k) => k.startsWith('c:')).map((k) => byId.get(k.slice(2))).filter(Boolean),
        std: recent.filter((k) => k.startsWith('s:')).map((k) => byChar?.get(k.slice(2))).filter(Boolean),
      }]
    }
    if (tab.startsWith('g:')) { const g = groups.find((x) => x.id === tab.slice(2)); return [{ title: g?.name || 'Group', custom: g?.items || [], std: [] }] }
    const n = Number(tab.slice(2))
    return [{ title: CATS.find((c) => c[0] === n)?.[1], custom: [], std: pickerIndex?.byGroup.get(n) || [] }]
  }, [ql, tab, list, data, recent, byId, byChar, groups])
  const first = (n) => pickerIndex?.byGroup.get(n)?.[0]?.c
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
          <div key={`${s.title}-${tab}-${ql}`}>
            <div className="ep-title">{s.title}</div>
            {s.custom.length > 0 && <Grid custom items={s.custom} onPick={pick} onHover={showHint} />}
            {s.std.length > 0 && <Grid items={s.std} onPick={pick} onHover={showHint} />}
          </div>
        ))}
        {data && empty && <div className="muted small ep-empty">{tab === 'recent' && !ql ? 'Emoji you use will show up here.' : 'Nothing found.'}</div>}
        {!ql && tab === 'recent' && !groups.length && <div className="muted tiny ep-empty">Groups can add their own emoji in group settings. You can use them anywhere, even in DMs.</div>}
      </div>
      <div className="ep-hint" ref={hint} aria-hidden="true" />
    </div>
  )
}
