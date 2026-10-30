import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import ChanIcon from './ChanIcon.jsx'
import Icon from './Icon.jsx'
import { confirmDialog, notify } from '../dialog.jsx'
import { openContext } from '../contextmenu.jsx'

// The channel list of a group. The founder can drag channels and categories around, and create, rename
// and delete them right here. Everyone else just sees the list.

const clean = (v) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)

function build(detail) {
  return {
    cats: detail.categories.map((c) => ({ ...c, channels: detail.channels.filter((ch) => ch.category_id === c.id) })),
    loose: detail.channels.filter((ch) => !ch.category_id),
  }
}

function Count({ n }) {
  if (!n) return null
  return <span className="count">{n > 99 ? '99+' : n}</span>
}

function InlineName({ initial = '', placeholder, onSubmit, onCancel, format = (v) => v, max = 30, icon }) {
  const [v, setV] = useState(initial)
  const ref = useRef(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = (ok) => {
    if (done.current) return
    done.current = true
    if (ok && v.trim() && v.trim() !== initial) onSubmit(v.trim())
    else onCancel()
  }
  return (
    <div className="inline-edit">
      {icon && <Icon name={icon} size={15} />}
      <input
        ref={ref}
        value={v}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => setV(format(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false) }}
        onBlur={() => finish(true)}
        aria-label={placeholder}
      />
    </div>
  )
}

export default function GroupSidebar({ group, detail, channelId, unread, mentions = {}, isFounder, onPick, onChanged, onChannelSettings }) {
  const [override, setOverride] = useState(null)
  const [dragging, setDragging] = useState(null) // { type, id }
  const [hover, setHover] = useState(null)       // { kind, id, pos }
  const [editing, setEditing] = useState(null)   // { type, id }
  const [adding, setAdding] = useState(null)     // { type: 'cat' } | { type: 'ch', catId }
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nook-collapsed') || '[]')) } catch { return new Set() }
  })
  const drag = useRef(null)

  useEffect(() => { setOverride(null) }, [detail])
  const layout = useMemo(() => override || build(detail), [override, detail])

  const toggle = (id) => {
    setCollapsed((cur) => {
      const next = new Set(cur)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('nook-collapsed', JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }

  async function commit(next) {
    setOverride(next)
    const cats = next.cats.map((c, i) => ({ id: c.id, position: i }))
    const chans = [
      ...next.loose.map((c, i) => ({ id: c.id, category_id: null, position: i })),
      ...next.cats.flatMap((cat) => cat.channels.map((c, i) => ({ id: c.id, category_id: cat.id, position: i }))),
    ]
    const { error } = await supabase.rpc('reorder_layout', { gid: group.id, cats, chans })
    if (error) { notify(error.message, 'error'); setOverride(null) } else onChanged()
  }

  function moveChannel(chId, catId, beforeId) {
    const all = [...layout.loose, ...layout.cats.flatMap((c) => c.channels)]
    const ch = all.find((c) => c.id === chId)
    if (!ch || chId === beforeId) return
    const strip = (list) => list.filter((c) => c.id !== chId)
    const put = (list) => {
      const i = beforeId ? list.findIndex((c) => c.id === beforeId) : -1
      const out = [...list]
      out.splice(i < 0 ? out.length : i, 0, { ...ch, category_id: catId })
      return out
    }
    commit({
      loose: catId ? strip(layout.loose) : put(strip(layout.loose)),
      cats: layout.cats.map((c) => ({ ...c, channels: c.id === catId ? put(strip(c.channels)) : strip(c.channels) })),
    })
  }

  function moveCategory(catId, beforeId) {
    if (catId === beforeId) return
    const cat = layout.cats.find((c) => c.id === catId)
    const rest = layout.cats.filter((c) => c.id !== catId)
    const i = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1
    rest.splice(i < 0 ? rest.length : i, 0, cat)
    commit({ ...layout, cats: rest })
  }

  const end = () => { drag.current = null; setDragging(null); setHover(null) }
  const half = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
  }
  const startDrag = (type, id) => (e) => {
    if (!isFounder) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    drag.current = { type, id }
    // Let the browser take its drag image first, then fade the original.
    requestAnimationFrame(() => setDragging({ type, id }))
  }

  /* ---- channels ---- */
  const channelRow = (c, catId, list) => {
    if (editing?.type === 'ch' && editing.id === c.id) {
      return (
        <InlineName key={c.id} icon="hash" initial={c.name} placeholder="channel-name" format={clean}
          onCancel={() => setEditing(null)}
          onSubmit={async (name) => {
            setEditing(null)
            const { error } = await supabase.from('channels').update({ name }).eq('id', c.id)
            error ? notify(error.message, 'error') : onChanged()
          }} />
      )
    }
    const h = hover?.kind === 'ch' && hover.id === c.id ? hover.pos : ''
    return (
      <div
        key={c.id}
        className={`ch-row ${dragging?.id === c.id ? 'lifted' : ''} ${h ? `drop-${h}` : ''}`}
        draggable={isFounder}
        onDragStart={startDrag('ch', c.id)}
        onDragEnd={end}
        onContextMenu={(e) => openContext(e, [
          { label: 'Open channel', icon: 'hash', onClick: () => onPick(c.id) },
          { label: 'Copy channel name', icon: 'copy', onClick: () => navigator.clipboard?.writeText(c.name).then(() => notify('Copied.'), () => {}) },
          isFounder && 'sep',
          isFounder && { label: 'Channel settings', icon: 'sliders', onClick: () => onChannelSettings?.(c) },
          isFounder && { label: 'Rename channel', icon: 'pencil', onClick: () => setEditing({ type: 'ch', id: c.id }) },
          isFounder && { label: 'Delete channel', icon: 'trash', danger: true, onClick: async () => {
            if (!(await confirmDialog({ title: `Delete #${c.name}?`, body: 'Its messages will be removed too.', confirmLabel: 'Delete', danger: true }))) return
            const { error } = await supabase.from('channels').delete().eq('id', c.id)
            error ? notify(error.message, 'error') : onChanged()
          } },
        ])}
        onDragOver={(e) => {
          if (drag.current?.type !== 'ch' || drag.current.id === c.id) return
          e.preventDefault()
          e.stopPropagation()
          const pos = half(e)
          if (hover?.id !== c.id || hover.pos !== pos) setHover({ kind: 'ch', id: c.id, pos })
        }}
        onDrop={(e) => {
          if (drag.current?.type !== 'ch') return
          e.preventDefault()
          e.stopPropagation()
          const pos = half(e)
          const idx = list.findIndex((x) => x.id === c.id)
          const before = pos === 'before' ? c.id : list[idx + 1]?.id || null
          const id = drag.current.id
          end()
          moveChannel(id, catId, before)
        }}
      >
        <button
          className={`row-btn ch ${channelId === c.id ? 'on' : ''} ${unread[c.id] && channelId !== c.id ? 'unread' : ''} ${mentions[c.id] && channelId !== c.id ? 'mention' : ''}`}
          onClick={() => onPick(c.id)}
          onDoubleClick={() => isFounder && setEditing({ type: 'ch', id: c.id })}
        >
          <ChanIcon c={c} /> <span className="ellipsis">{c.name}</span>
          {channelId !== c.id && <Count n={unread[c.id]} />}
        </button>
        {isFounder && (
          <span className="row-tools">
            <button className="icon-btn" title="Channel settings" aria-label={`Settings for ${c.name}`} onClick={() => onChannelSettings?.(c)}><Icon name="sliders" size={13} /></button>
            <button className="icon-btn" title="Rename" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ type: 'ch', id: c.id })}><Icon name="pencil" size={13} /></button>
            <button className="icon-btn danger" title="Delete" aria-label={`Delete ${c.name}`} onClick={async () => {
              if (!(await confirmDialog({ title: `Delete #${c.name}?`, body: 'Its messages will be removed too.', confirmLabel: 'Delete', danger: true }))) return
              const { error } = await supabase.from('channels').delete().eq('id', c.id)
              error ? notify(error.message, 'error') : onChanged()
            }}><Icon name="trash" size={13} /></button>
          </span>
        )}
      </div>
    )
  }

  const addChannelRow = (catId) =>
    adding?.type === 'ch' && adding.catId === catId ? (
      <InlineName key="add-ch" icon="hash" placeholder="new-channel" format={clean} onCancel={() => setAdding(null)}
        onSubmit={async (name) => {
          setAdding(null)
          const list = catId ? layout.cats.find((c) => c.id === catId)?.channels || [] : layout.loose
          const { error } = await supabase.from('channels').insert({ group_id: group.id, category_id: catId, name, position: list.length })
          error ? notify(error.message, 'error') : onChanged()
        }} />
    ) : null

  /* ---- the "no category" section is also a drop target (drop on empty space to move a channel out) ---- */
  const looseZone = {
    onDragOver: (e) => { if (drag.current?.type === 'ch') { e.preventDefault(); if (hover?.kind !== 'loose') setHover({ kind: 'loose' }) } },
    onDrop: (e) => { if (drag.current?.type !== 'ch') return; e.preventDefault(); const id = drag.current.id; end(); moveChannel(id, null, null) },
  }

  return (
    <div className={`side-list group-list ${isFounder ? "editable" : ""} ${dragging ? "is-dragging" : ""}`} onDragEnd={end}>
      {layout.loose.length > 0 || isFounder ? (
        <div className={`zone ${hover?.kind === 'loose' ? 'zone-on' : ''}`} {...looseZone}>
          {layout.loose.map((c) => channelRow(c, null, layout.loose))}
          {addChannelRow(null)}
        </div>
      ) : null}

      {layout.cats.map((cat) => {
        const open = !collapsed.has(cat.id)
        const h = hover?.kind === 'cat' && hover.id === cat.id ? hover.pos : ''
        const into = hover?.kind === 'cat-into' && hover.id === cat.id
        return (
          <div
            key={cat.id}
            className={`cat ${dragging?.id === cat.id ? 'lifted' : ''} ${h ? `drop-${h}` : ''} ${into ? 'zone-on' : ''}`}
            onDragOver={(e) => {
              const d = drag.current
              if (!d) return
              if (d.type === 'cat' && d.id !== cat.id) {
                e.preventDefault()
                const pos = half(e)
                if (hover?.id !== cat.id || hover.pos !== pos || hover.kind !== 'cat') setHover({ kind: 'cat', id: cat.id, pos })
              } else if (d.type === 'ch') {
                e.preventDefault()
                if (hover?.id !== cat.id || hover.kind !== 'cat-into') setHover({ kind: 'cat-into', id: cat.id })
              }
            }}
            onDrop={(e) => {
              const d = drag.current
              if (!d) return
              e.preventDefault()
              if (d.type === 'cat') {
                const pos = half(e)
                const idx = layout.cats.findIndex((x) => x.id === cat.id)
                const before = pos === 'before' ? cat.id : layout.cats[idx + 1]?.id || null
                end()
                moveCategory(d.id, before)
              } else {
                end()
                moveChannel(d.id, cat.id, null)
              }
            }}
          >
            {editing?.type === 'cat' && editing.id === cat.id ? (
              <InlineName initial={cat.name} placeholder="Category name" onCancel={() => setEditing(null)}
                onSubmit={async (name) => {
                  setEditing(null)
                  const { error } = await supabase.from('categories').update({ name }).eq('id', cat.id)
                  error ? notify(error.message, 'error') : onChanged()
                }} />
            ) : (
              <div className="cat-label" draggable={isFounder} onDragStart={startDrag('cat', cat.id)} onDragEnd={end}
                onContextMenu={(e) => openContext(e, [
                  { label: open ? 'Collapse' : 'Expand', icon: 'chevron', onClick: () => toggle(cat.id) },
                  isFounder && 'sep',
                  isFounder && { label: 'Add channel', icon: 'plus', onClick: () => { setCollapsed((cs) => { const n = new Set(cs); n.delete(cat.id); return n }); setAdding({ type: 'ch', catId: cat.id }) } },
                  isFounder && { label: 'Rename category', icon: 'pencil', onClick: () => setEditing({ type: 'cat', id: cat.id }) },
                  isFounder && { label: 'Delete category', icon: 'trash', danger: true, onClick: async () => {
                    if (!(await confirmDialog({ title: `Delete category ${cat.name}?`, body: 'Its channels stay, uncategorised.', confirmLabel: 'Delete', danger: true }))) return
                    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
                    error ? notify(error.message, 'error') : onChanged()
                  } },
                ])}>
                <button className="cat-toggle" onClick={() => toggle(cat.id)} onDoubleClick={() => isFounder && setEditing({ type: 'cat', id: cat.id })} aria-expanded={open}>
                  <Icon name="chevron" size={11} className={open ? '' : 'rot'} />
                  <span className="ellipsis">{cat.name}</span>
                </button>
                {isFounder && (
                  <span className="row-tools">
                    <button className="icon-btn" title="Add channel" aria-label={`Add a channel to ${cat.name}`} onClick={() => { setCollapsed((s) => { const n = new Set(s); n.delete(cat.id); return n }); setAdding({ type: 'ch', catId: cat.id }) }}><Icon name="plus" size={13} /></button>
                    <button className="icon-btn" title="Rename" aria-label={`Rename ${cat.name}`} onClick={() => setEditing({ type: 'cat', id: cat.id })}><Icon name="pencil" size={13} /></button>
                    <button className="icon-btn danger" title="Delete" aria-label={`Delete ${cat.name}`} onClick={async () => {
                      if (!(await confirmDialog({ title: `Delete category ${cat.name}?`, body: 'Its channels stay, uncategorised.', confirmLabel: 'Delete', danger: true }))) return
                      const { error } = await supabase.from('categories').delete().eq('id', cat.id)
                      error ? notify(error.message, 'error') : onChanged()
                    }}><Icon name="trash" size={13} /></button>
                  </span>
                )}
              </div>
            )}
            {(open || adding?.catId === cat.id) && (
              <div className="cat-body">
                {cat.channels.map((c) => channelRow(c, cat.id, cat.channels))}
                {addChannelRow(cat.id)}
                {isFounder && cat.channels.length === 0 && !adding && <div className="cat-empty">Drop channels here</div>}
              </div>
            )}
          </div>
        )
      })}

      {isFounder && (
        <div className="add-row">
          {adding?.type === 'cat' ? (
            <InlineName placeholder="Category name" onCancel={() => setAdding(null)}
              onSubmit={async (name) => {
                setAdding(null)
                const { error } = await supabase.from('categories').insert({ group_id: group.id, name, position: layout.cats.length })
                error ? notify(error.message, 'error') : onChanged()
              }} />
          ) : (
            <>
              <button className="add-btn" onClick={() => setAdding({ type: 'ch', catId: null })}><Icon name="plus" size={13} /> Channel</button>
              <button className="add-btn" onClick={() => setAdding({ type: 'cat' })}><Icon name="plus" size={13} /> Category</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
