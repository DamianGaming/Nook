import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'

/* ───────── Slash commands ─────────
   Bots publish commands (name, description, options). Typing "/" in a group shows them above the message box. */

export function useSlashCommands(groupId) {
  const [list, setList] = useState([])
  const load = useCallback(async () => {
    if (!groupId) return setList([])
    const { data, error } = await supabase.rpc('group_slash_commands', { gid: groupId })
    setList(error ? [] : data || [])
  }, [groupId])
  useEffect(() => {
    setList([])
    load()
    const t = setInterval(load, 90000)
    return () => clearInterval(t)
  }, [load])
  return list
}

// Commands built into Nook itself, so "/" is useful even before any bot is added.
export const BUILTINS = [
  { builtin: true, name: 'shrug', description: 'Add ¯\\_(ツ)_/¯ to your message', icon: 'smile', options: [{ name: 'message', type: 'string', description: 'Your message' }], run: (t) => `${t} ¯\\_(ツ)_/¯`.trim() },
  { builtin: true, name: 'tableflip', description: 'Flip the table', icon: 'smile', options: [{ name: 'message', type: 'string', description: 'Your message' }], run: (t) => `${t} (╯°□°)╯︵ ┻━┻`.trim() },
  { builtin: true, name: 'unflip', description: 'Put the table back', icon: 'smile', options: [{ name: 'message', type: 'string', description: 'Your message' }], run: (t) => `${t} ┬─┬ ノ( ゜-゜ノ)`.trim() },
  { builtin: true, name: 'me', description: 'Say something in italics', icon: 'pencil', options: [{ name: 'action', type: 'string', description: 'What you are doing', required: true }], run: (t) => (t ? `*${t}*` : '') },
  { builtin: true, name: 'spoiler', description: 'Hide your message until it is clicked', icon: 'eyeoff', options: [{ name: 'message', type: 'string', description: 'Your message', required: true }], run: (t) => (t ? `||${t}||` : '') },
  { builtin: true, name: 'embed', description: 'Build an embed card with buttons', icon: 'layout', options: [], action: 'embed' },
  { builtin: true, name: 'poll', description: 'Start a poll', icon: 'chart', options: [], action: 'poll', groupOnly: true },
  { builtin: true, name: 'activity', description: 'Play or watch something together', icon: 'gamepad', options: [], action: 'activity', groupOnly: true },
]

const botProfile = (c) => ({ id: c.bot_id, username: c.bot_username, display_name: c.bot_name, avatar_url: c.bot_avatar })
const hint = (c) => (c.options || []).map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ')

export function SlashPopup({ list, index, onPick, onHover }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [index])
  return (
    <div className="slash-pop" role="listbox" aria-label="Bot commands" ref={ref}>
      <div className="slash-head">Commands <span className="slash-count">{list.length}</span></div>
      {list.map((c, i) => (
        <button key={`${c.bot_id || 'nook'}:${c.name}`} type="button" role="option" aria-selected={i === index} className={i === index ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); onPick(c) }} onMouseEnter={() => onHover(i)}>
          {c.builtin ? <span className="slash-icon"><Icon name={c.icon || 'slash'} size={16} /></span> : <Avatar profile={botProfile(c)} size={30} />}
          <span className="slash-main">
            <span className="slash-name"><b>/{c.name}</b>{hint(c) && <span className="slash-hint">{hint(c)}</span>}</span>
            <span className="slash-desc ellipsis">{c.description}</span>
          </span>
          <span className="slash-bot ellipsis">{c.builtin ? 'Nook' : c.bot_name || c.bot_username}</span>
        </button>
      ))}
    </div>
  )
}

/* A small form above the message box for a command's options. */
export function SlashForm({ cmd, people, onRun, onCancel }) {
  const [vals, setVals] = useState(() => Object.fromEntries((cmd.options || []).filter((o) => o.type === 'boolean').map((o) => [o.name, false])))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef(null)
  useEffect(() => { first.current?.focus() }, [])
  const set = (k, v) => setVals((x) => ({ ...x, [k]: v }))
  async function run(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    const out = {}
    for (const o of cmd.options || []) {
      const v = vals[o.name]
      if (v === undefined || v === '' || (o.type === 'boolean' && v === false && !o.required)) continue
      out[o.name] = o.type === 'integer' || o.type === 'number' ? String(v) : o.type === 'boolean' ? String(!!v) : String(v).replace(/^[@#]/, '')
    }
    const m = await onRun(out)
    setBusy(false)
    if (m) setErr(m)
  }
  return (
    <form className="slash-form" onSubmit={run} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} aria-label={`Run /${cmd.name}`}>
      <div className="slash-form-head">
        <Avatar profile={botProfile(cmd)} size={26} />
        <span className="slash-main"><b>/{cmd.name}</b><span className="slash-desc ellipsis">{cmd.description}</span></span>
        <button type="button" className="icon-btn" aria-label="Cancel command" onClick={onCancel}><Icon name="x" size={16} /></button>
      </div>
      {(cmd.options || []).length > 0 && (
        <div className="slash-fields">
          {cmd.options.map((o, idx) => {
            const ref = idx === 0 ? first : undefined
            const label = <span>{o.name}{o.required && <i aria-hidden="true"> *</i>} <span className="muted tiny">{o.description}</span></span>
            const choices = o.choices || []
            return (
              <label key={o.name} className="slash-field">
                {label}
                {choices.length > 0 ? (
                  <select ref={ref} value={vals[o.name] ?? ''} onChange={(e) => set(o.name, e.target.value)} required={o.required}>
                    <option value="">{o.required ? 'Choose…' : 'None'}</option>
                    {choices.map((c) => <option key={c.value} value={c.value}>{c.name}</option>)}
                  </select>
                ) : o.type === 'boolean' ? (
                  <input ref={ref} type="checkbox" className="switch" checked={!!vals[o.name]} onChange={(e) => set(o.name, e.target.checked)} />
                ) : o.type === 'user' ? (
                  <select ref={ref} value={vals[o.name] ?? ''} onChange={(e) => set(o.name, e.target.value)} required={o.required}>
                    <option value="">{o.required ? 'Choose someone…' : 'Nobody'}</option>
                    {(people || []).map((p) => <option key={p.id} value={p.username}>{p.display_name || p.username} (@{p.username})</option>)}
                  </select>
                ) : (
                  <input ref={ref} value={vals[o.name] ?? ''} onChange={(e) => set(o.name, e.target.value)} required={o.required} maxLength={1000}
                    type={o.type === 'integer' || o.type === 'number' ? 'number' : 'text'} step={o.type === 'integer' ? 1 : 'any'} placeholder={o.type === 'channel' ? 'channel name' : ''} />
                )}
              </label>
            )
          })}
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      <div className="row tight"><button className="primary small" disabled={busy}>{busy ? 'Sending…' : 'Run command'}</button><span className="muted tiny">Enter to run, Esc to cancel</span></div>
    </form>
  )
}

/* ───────── Replies only you can see ───────── */
export function useHidden(channelId) {
  const [items, setItems] = useState([])
  const [waiting, setWaiting] = useState([])
  const [modals, setModals] = useState([])
  const profiles = useRef(new Map())
  const timer = useRef(0)
  const live = useRef(true)
  const load = useCallback(async () => {
    if (!channelId) return
    const since = new Date(Date.now() - 3600e3).toISOString()
    const { data, error } = await supabase.from('ephemeral_messages').select('id, bot_id, content, created_at').eq('channel_id', channelId).gte('created_at', since).order('created_at')
    if (error || !live.current) return
    const need = [...new Set((data || []).map((x) => x.bot_id))].filter((id) => !profiles.current.has(id))
    if (need.length) {
      const { data: ps } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', need)
      ;(ps || []).forEach((p) => profiles.current.set(p.id, p))
    }
    if (live.current) setItems((data || []).map((x) => ({ ...x, bot: profiles.current.get(x.bot_id) || { id: x.bot_id, username: 'bot' } })))
    const { data: forms } = await supabase.from('modal_requests').select('id, bot_id, def, created_at').eq('channel_id', channelId).gte('created_at', new Date(Date.now() - 900e3).toISOString()).order('created_at')
    if (live.current) setModals(forms || [])
  }, [channelId])
  useEffect(() => {
    live.current = true
    setItems([]); setWaiting([]); setModals([])
    load()
    return () => { live.current = false; clearInterval(timer.current) }
  }, [load])
  // After running a command or pressing a button, look for the answer a few times.
  const watch = useCallback((seconds = 20, label) => {
    clearInterval(timer.current)
    const end = Date.now() + seconds * 1000
    timer.current = setInterval(() => { load(); if (Date.now() > end) clearInterval(timer.current) }, 1200)
    if (label) {
      const key = Math.random().toString(36).slice(2)
      setWaiting((w) => [...w.slice(-2), { key, label }])
      setTimeout(() => live.current && setWaiting((w) => w.filter((x) => x.key !== key)), 6000)
    }
  }, [load])
  const dismiss = useCallback(async (id) => {
    setItems((x) => x.filter((i) => i.id !== id))
    await supabase.from('ephemeral_messages').delete().eq('id', id)
  }, [])
  const closeForm = useCallback(async (id) => {
    setModals((x) => x.filter((m) => m.id !== id))
    await supabase.from('modal_requests').delete().eq('id', id)
  }, [])
  return { items, waiting, modals, watch, dismiss, closeForm }
}

/* A form a bot asked you to fill in. */
function BotForm({ form, onClose, onSent }) {
  const [vals, setVals] = useState(() => Object.fromEntries(form.def.fields.map((f) => [f.id, f.value || ''])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const first = useRef(null)
  useEffect(() => {
    first.current?.focus()
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  async function send(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('submit_modal', { req: form.id, vals })
    setBusy(false)
    if (error) return setErr(error.message)
    onSent()
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal bot-form" role="dialog" aria-label={form.def.title} onSubmit={send}>
        <div className="modal-head"><h2>{form.def.title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        {form.def.fields.map((f, i) => (
          <label key={f.id}>{f.label}{!f.required && <span className="muted tiny"> (optional)</span>}
            {f.style === 'paragraph'
              ? <textarea ref={i === 0 ? first : null} rows={4} value={vals[f.id]} maxLength={f.max} placeholder={f.placeholder} required={f.required} minLength={f.min || undefined} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />
              : <input ref={i === 0 ? first : null} value={vals[f.id]} maxLength={f.max} placeholder={f.placeholder} required={f.required} minLength={f.min || undefined} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />}
          </label>
        ))}
        {err && <div className="error" role="alert">{err}</div>}
        <div className="row tight"><button className="primary" disabled={busy}>{busy ? 'Sending…' : form.def.submit || 'Submit'}</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  )
}

export function HiddenReplies({ hidden, render }) {
  const form = hidden.modals?.[0]
  if (!hidden.items.length && !hidden.waiting.length && !form) return null
  return (
    <div className="hidden-replies" aria-live="polite">
      {form && <BotForm key={form.id} form={form} onClose={() => hidden.closeForm(form.id)} onSent={() => { hidden.closeForm(form.id); hidden.watch(20) }} />}
      {hidden.waiting.map((w) => <div key={w.key} className="hidden-wait"><span className="spin" aria-hidden="true" /> {w.label}</div>)}
      {hidden.items.map((i) => (
        <div key={i.id} className="hidden-card">
          <Avatar profile={i.bot} size={32} />
          <div className="hidden-body">
            <div className="hidden-head"><strong>{i.bot.display_name || i.bot.username}</strong> <span className="bot-tag">BOT</span><span className="hidden-note"><Icon name="eyeoff" size={12} /> Only you can see this</span></div>
            {render(i.content)}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss this message" title="Dismiss" onClick={() => hidden.dismiss(i.id)}><Icon name="x" size={15} /></button>
        </div>
      ))}
    </div>
  )
}
