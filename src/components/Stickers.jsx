import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useStickers, loadStickers, resolveStickers, searchGifs, GIPHY_KEY, stickerToken, GIF_CATEGORIES, useGifFavorites, loadGifFavorites, toggleGifFavorite } from '../stickers.js'
import { supabase } from '../supabase.js'
import Icon from './Icon.jsx'

// Who is signed in (the picker and GIF messages are only shown to signed-in people).
function useUser() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    let on = true
    supabase.auth.getSession().then(({ data }) => { if (on) setUser(data?.session?.user || null) })
    return () => { on = false }
  }, [])
  return user
}

/* A sticker inside a message: a big picture. */
export const StickerView = memo(function StickerView({ id, name }) {
  const { byId } = useStickers()
  const s = byId.get(id)
  useEffect(() => { if (!s) resolveStickers([id]) }, [id, s])
  if (!s?.url) return <span className="cemoji-miss" title={s?.missing ? 'This sticker was removed' : undefined}>Sticker: {name}</span>
  return <img className="sticker" src={s.url} alt={`Sticker: ${name}`} title={name} loading="lazy" decoding="async" draggable="false" />
})

export function GifView({ url, onOpen }) {
  const user = useUser()
  const fav = useGifFavorites()
  useEffect(() => { if (user) loadGifFavorites() }, [user])
  const saved = fav.list.some((f) => f.url === url)
  return (
    <span className="gif-wrap">
      <button type="button" className="attach gif" onClick={() => onOpen?.(url)} aria-label="Open GIF">
        <img src={url} alt="GIF" loading="lazy" decoding="async" draggable="false" referrerPolicy="no-referrer" />
      </button>
      {user && !fav.missing && (
        <button type="button" className={'gif-star' + (saved ? ' on' : '')} aria-pressed={saved} aria-label={saved ? 'Remove from favourite GIFs' : 'Add to favourite GIFs'} title={saved ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleGifFavorite(url, user.id)}>
          <Icon name="star" size={16} />
        </button>
      )}
    </span>
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
  const user = useUser()
  const fav = useGifFavorites()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Trending')
  const [items, setItems] = useState(null)
  const [next, setNext] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const timer = useRef(0)
  const body = useRef(null)
  const term = cat === 'Favourites' ? '' : q.trim() || (cat === 'Trending' ? '' : cat)
  useEffect(() => { if (user) loadGifFavorites() }, [user])
  useEffect(() => {
    if (cat === 'Favourites') return undefined
    const ctl = new AbortController()
    clearTimeout(timer.current)
    setItems(null); setNext(null); setErr('')
    timer.current = setTimeout(() => {
      searchGifs(term, ctl.signal).then((r) => { setItems(r.items); setNext(r.next) }, (e) => { if (e.name !== 'AbortError') { setErr(e.message || 'GIF search failed.'); setItems([]) } })
    }, q ? 350 : 0)
    return () => { ctl.abort(); clearTimeout(timer.current) }
  }, [term, cat, q])
  const loadMore = () => {
    if (next == null || more) return
    setMore(true)
    searchGifs(term, undefined, next).then((r) => {
      setItems((old) => { const seen = new Set((old || []).map((g) => g.id)); return [...(old || []), ...r.items.filter((g) => !seen.has(g.id))] })
      setNext(r.next)
    }, (e) => setErr(e.message || 'GIF search failed.')).finally(() => setMore(false))
  }
  // Load the next page when you scroll near the bottom.
  const onScroll = (e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) loadMore() }
  const star = async (g) => { setNote(await toggleGifFavorite(g.url, user.id) || '') }
  if (!GIPHY_KEY) return <div className="ep-body"><div className="muted small ep-empty">GIF search is not switched on for this site.</div></div>
  const showFavs = cat === 'Favourites'
  const grid = showFavs ? fav.list.map((f) => ({ id: f.url, preview: f.preview, url: f.url })) : items || []
  const isFav = (u) => fav.list.some((f) => f.url === u)
  return (
    <>
      <div className="ep-search"><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); if (cat === 'Favourites') setCat('Trending') }} placeholder="Search GIFs" aria-label="Search GIFs" /></div>
      <div className="gif-cats" role="tablist" aria-label="GIF categories">
        {user && !fav.missing && <button type="button" role="tab" aria-selected={showFavs} className={'gif-cat' + (showFavs ? ' on' : '')} onClick={() => { setCat('Favourites'); setQ('') }}><Icon name="star" size={13} /> Favourites</button>}
        {GIF_CATEGORIES.map((c) => <button key={c} type="button" role="tab" aria-selected={!showFavs && !q && cat === c} className={'gif-cat' + (!showFavs && !q && cat === c ? ' on' : '')} onClick={() => { setCat(c); setQ('') }}>{c}</button>)}
      </div>
      <div className="ep-body gif-pane" ref={body} onScroll={showFavs ? undefined : onScroll}>
        {!showFavs && items === null && <div className="muted small ep-empty">Loading…</div>}
        {err && <div className="error">{err}</div>}
        {note && <div className="error" role="status">{note}</div>}
        {showFavs && !fav.list.length && <div className="muted small ep-empty">No favourites yet. Tap the star on a GIF to keep it here.</div>}
        {!showFavs && items && !items.length && !err && <div className="muted small ep-empty">Nothing found.</div>}
        <div className="gif-grid">
          {grid.map((g) => (
            <div key={g.id} className="gif-item">
              <button type="button" className="gif-btn" aria-label="Send this GIF" onClick={() => onPick(g.url)}><img src={g.preview} alt="" loading="lazy" referrerPolicy="no-referrer" /></button>
              {user && !fav.missing && <button type="button" className={'gif-star' + (isFav(g.url) ? ' on' : '')} aria-pressed={isFav(g.url)} aria-label={isFav(g.url) ? 'Remove from favourites' : 'Add to favourites'} onClick={() => star(g)}><Icon name="star" size={14} /></button>}
            </div>
          ))}
        </div>
        {!showFavs && next != null && <button type="button" className="ghost gif-more" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Load more'}</button>}
        <div className="muted tiny ep-empty">Powered by GIPHY. Showing a GIF contacts GIPHY.</div>
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
