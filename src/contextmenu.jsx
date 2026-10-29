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
  const list = items.filter(Boolean)
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

  useLayoutEffect(() => {
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
        ) : (
          <button key={it.label} role="menuitem" className={`ctx-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled}
            onClick={() => { closeContext(); it.onClick?.() }}>
            {it.icon ? <Icon name={it.icon} size={15} /> : <span className="ctx-gap" />}
            <span>{it.label}</span>
          </button>
        )
      )}
    </div>
  )
}
