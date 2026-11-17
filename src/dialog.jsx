import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Icon from './components/Icon.jsx'

// In-app replacements for the browser's confirm(), prompt() and alert().
// confirmDialog() and promptDialog() return promises; notify() shows a small toast.
let dialog = null
let toasts = []
let seq = 0
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }

function open(spec) {
  return new Promise((resolve) => {
    if (dialog) dialog.resolve(spec.kind === 'prompt' ? null : false)
    dialog = { ...spec, resolve: (v) => { dialog = null; emit(); resolve(v) } }
    emit()
  })
}

export const confirmDialog = (o) => open({ kind: 'confirm', confirmLabel: 'Confirm', ...(typeof o === 'string' ? { title: o } : o) })
export const REPORT_REASONS = [
  ['spam', 'Spam or scam'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate or discrimination'],
  ['sexual', 'Sexual or adult content'],
  ['violence', 'Violence or threats'],
  ['selfharm', 'Self-harm'],
  ['childsafety', 'Child safety'],
  ['illegal', 'Illegal activity'],
  ['impersonation', 'Pretending to be someone'],
  ['copyright', 'Copyright'],
  ['other', 'Something else'],
]
export const reportDialog = (o) => open({ kind: 'report', confirmLabel: 'Send report', ...o })
export const promptDialog = (o) => open({ kind: 'prompt', confirmLabel: 'Save', value: '', ...o })

export function notify(message, kind = 'info', opts = {}) {
  const id = ++seq
  toasts = [...toasts.slice(-2), { id, message, kind, action: opts.action }]
  emit()
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit() }, opts.duration || (kind === 'error' ? 6000 : 3500))
}
const dismiss = (id) => { toasts = toasts.filter((t) => t.id !== id); emit() }

const snap = () => dialog
const snapToasts = () => toasts

function DialogView({ d }) {
  const [text, setText] = useState(d.value || '')
  const [cat, setCat] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const cancel = () => d.resolve(d.kind === 'prompt' || d.kind === 'report' ? null : false)
  const ok = () => d.resolve(d.kind === 'prompt' ? text : d.kind === 'report' ? { category: cat, reason: text.trim() } : true)
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  return (
    <div className="overlay front" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel() }}>
      <form className="modal confirm" role="dialog" aria-modal="true" aria-label={d.title} onSubmit={(e) => { e.preventDefault(); ok() }}>
        <div className="confirm-body">
          <h2>{d.title}</h2>
          {d.body && <p className="muted">{d.body}</p>}
          {d.kind === 'report' && (
            <>
              <div className="report-reasons" role="radiogroup" aria-label="Reason">
                {REPORT_REASONS.map(([id, label]) => (
                  <button type="button" key={id} role="radio" aria-checked={cat === id} className={`choice small ${cat === id ? 'on' : ''}`} onClick={() => setCat(id)}>{label}</button>
                ))}
              </div>
              <textarea className="report-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} placeholder="Add details (optional)" />
              <p className="muted tiny">Reports are private. If someone is in danger, contact your local emergency services.</p>
            </>
          )}
          {d.kind === 'prompt' && (
            <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={d.maxLength || 500} placeholder={d.placeholder || ''} />
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="ghost" onClick={cancel}>Cancel</button>
          <button
            type="submit"
            ref={d.kind === 'confirm' ? ref : null}
            className={d.danger ? 'danger-btn' : 'primary'}
            disabled={(d.kind === 'prompt' && d.required && !text.trim()) || (d.kind === 'report' && !cat)}
          >{d.confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}

export function DialogHost() {
  const d = useSyncExternalStore(subscribe, snap)
  const t = useSyncExternalStore(subscribe, snapToasts)
  return (
    <>
      {d && <DialogView key={d} d={d} />}
      <div className="toasts" aria-live="polite">
        {t.map((x) => (
          <div key={x.id} className={'toast-item ' + x.kind}>
            <Icon name={x.kind === 'error' ? 'alert' : 'check'} size={16} />
            <span>{x.message}</span>
            {x.action && <button className="toast-action" onClick={() => { x.action.onClick(); dismiss(x.id) }}>{x.action.label}</button>}
          </div>
        ))}
      </div>
    </>
  )
}
