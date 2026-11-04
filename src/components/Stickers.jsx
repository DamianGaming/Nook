import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useStickers, loadStickers, resolveStickers, searchGifs, TENOR_KEY, stickerToken } from '../stickers.js'

/* A sticker inside a message: a big picture. */
export const StickerView = memo(function StickerView({ id, name }) {
  const { byId } = useStickers()
  const s = byId.get(id)
  useEffect(() => { if (!s) resolveStickers([id]) }, [id, s])
  if (!s?.url) return <span className="cemoji-miss" title={s?.missing ? 'This sticker was removed' : undefined}>Sticker: {name}</span>
  return <img className="sticker" src={s.url} alt={`Sticker: ${name}`} title={name} loading="lazy" decoding="async" draggable="false" />
})

export function GifView({ url, onOpen }) {
  return (
    <button type="button" className="attach gif" onClick={() => onOpen?.(url)} aria-label="Open GIF">
      <img src={url} alt="GIF" loading="lazy" decoding="async" draggable="false" referrerPolicy="no-referrer" />
    </button>
  )
}

export function StickerPane({ onPick }) {
  const { list, loaded } = useStickers()
  useEffect(() => { loadStickers() }, [])
  const groups = useMemo(() => {
    const m = new Map()
    list.forEach((s) => { if (!m.has(s.group_id)) m.set(s.group_id, { name: s.group_name, items: [] }); m.get(s.group_id).items.push(s) })
    return [...m.values()]
  }, [list])
  return (
    <div className="ep-body sticker-pane">
      {!loaded && <div className="muted small ep-empty">Loading…</div>}
      {loaded && !list.length && <div className="muted small ep-empty">No stickers yet. A group can add its own in group settings, and then you can use them anywhere.</div>}
      {groups.map((g) => (
        <div key={g.name}>
          <div className="ep-title">{g.name}</div>
          <div className="sticker-grid">
            {g.items.map((s) => <button key={s.id} type="button" className="sticker-btn" title={s.name} aria-label={`Send sticker ${s.name}`} onClick={() => onPick(stickerToken(s))}><img src={s.url} alt="" loading="lazy" /></button>)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function GifPane({ onPick }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const timer = useRef(0)
  useEffect(() => {
    const ctl = new AbortController()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setErr('')
      searchGifs(q.trim(), ctl.signal).then(setItems, (e) => { if (e.name !== 'AbortError') { setErr(e.message || 'GIF search failed.'); setItems([]) } })
    }, q ? 350 : 0)
    return () => { ctl.abort(); clearTimeout(timer.current) }
  }, [q])
  if (!TENOR_KEY) return <div className="ep-body"><div className="muted small ep-empty">GIF search is not switched on for this site.</div></div>
  return (
    <>
      <div className="ep-search"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" /></div>
      <div className="ep-body gif-pane">
        {items === null && <div className="muted small ep-empty">Loading…</div>}
        {err && <div className="error">{err}</div>}
        {items && !items.length && !err && <div className="muted small ep-empty">Nothing found.</div>}
        <div className="gif-grid">
          {(items || []).map((g) => <button key={g.id} type="button" className="gif-btn" aria-label="Send this GIF" onClick={() => onPick(g.url)}><img src={g.preview} alt="" loading="lazy" referrerPolicy="no-referrer" /></button>)}
        </div>
        <div className="muted tiny ep-empty">Powered by Tenor. Showing a GIF contacts Tenor.</div>
      </div>
    </>
  )
}

/* A card for the first link in a message, filled in by the link-preview function. */
export function LinkCard({ url, onLoad }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    let on = true
    import('../linkPreview.js').then((m) => m.getPreview(url)).then((r) => { if (on && r) { setP(r); setTimeout(() => onLoad?.(), 0) } })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  if (!p) return null
  return (
    <a className="link-card" href={p.url || url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="link-card-body">
        <span className="muted tiny">{p.site}</span>
        <strong>{p.title}</strong>
        {p.description && <span className="link-card-desc">{p.description}</span>}
      </span>
      {p.image && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
    </a>
  )
}
