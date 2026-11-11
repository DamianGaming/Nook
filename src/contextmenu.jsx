import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import Icon from './components/Icon.jsx'

// Right-click (or long-press) menus. Call openContext(event, items) from an onContextMenu handler.
// items: { label, icon?, onClick, danger?, disabled? } or 'sep'
let state = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }

export function openContext(e, items) {
  // Keep the browser's own menu for links, images and text boxes, where it is genuinely useful.
  if (e.target?.closest?.('a[href], img, textarea, input, [contenteditable="true"]')) return
  const list = items.filter(Boolean).filter((it, i, a) => !(it === 'sep' && (i === 0 || a[i - 1] === 'sep' || i === a.length - 1)))
  if (!list.length) return
  e.preventDefault()
  e.stopPropagation()
  state = { x: e.clientX, y: e.clientY, items: list }
  emit()
}
export const closeContext = () => { if (state) { state = null; emit() } }

export function ContextMenuHost() {
  const s = useSyncExternalStore(subscribe, () => state)
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const [openSub, setOpenSub] = useState(-1)

  useLayoutEffect(() => {
    setOpenSub(-1)
    if (!s || !ref.current) { setPos(null); return }
    const r = ref.current.getBoundingClientRect()
    const x = Math.min(s.x, window.innerWidth - r.width - 8)
    const y = Math.min(s.y, window.innerHeight - r.height - 8)
    setPos({ x: Math.max(8, x), y: Math.max(8, y) })
  }, [s])

  useEffect(() => {
    if (!s) return undefined
    const away = (e) => { if (!ref.current?.contains(e.target)) closeContext() }
    const key = (e) => e.key === 'Escape' && closeContext()
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('contextmenu', away, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', closeContext)
    window.addEventListener('blur', closeContext)
    document.addEventListener('scroll', closeContext, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('contextmenu', away, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', closeContext)
      window.removeEventListener('blur', closeContext)
      document.removeEventListener('scroll', closeContext, true)
    }
  }, [s])

  if (!s) return null
  return (
    <div ref={ref} className="ctx" role="menu" style={{ left: pos?.x ?? s.x, top: pos?.y ?? s.y, visibility: pos ? 'visible' : 'hidden' }}>
      {s.items.map((it, i) =>
        it === 'sep' ? (
          <div className="ctx-sep" key={`s${i}`} />
        ) : it.children ? (
          <div key={it.label} className="ctx-parent" onMouseEnter={() => setOpenSub(i)}>
            <button role="menuitem" aria-haspopup="menu" aria-expanded={openSub === i} className={`ctx-item ${it.danger ? 'danger' : ''}`} onClick={() => setOpenSub(openSub === i ? -1 : i)}>
              {it.icon ? <Icon name={it.icon} size={15} /> : <span className="ctx-gap" />}
              <span>{it.label}</span>
              <span className="ctx-arrow"><Icon name="chevron" size={12} /></span>
            </button>
            {openSub === i && (
              <div className={`ctx ctx-sub ${(pos?.x ?? s.x) + 420 > window.innerWidth ? 'flip' : ''}`} role="menu">
                {it.children.map((c) => (
                  <button key={c.label} role="menuitem" className={`ctx-item ${c.danger ? 'danger' : ''}`} disabled={c.disabled} onClick={() => { closeContext(); c.onClick?.() }}>
                    <span className="ctx-gap" /><span>{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button key={it.label} role="menuitem" className={`ctx-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} onMouseEnter={() => setOpenSub(-1)}
            onClick={() => { closeContext(); it.onClick?.() }}>
            {it.icon ? <Icon name={it.icon} size={15} /> : <span className="ctx-gap" />}
            <span>{it.label}</span>
          </button>
        )
      )}
    </div>
  )
}
