import { useMemo, useState } from 'react'
import { Modal } from './Modals.jsx'
import { EmbedView, encodeEmbed, parseEmbed, EMBED_MAX } from '../embeds.jsx'
import { ACCENTS } from './ColorPicker.jsx'

const COLORS = ['#6475f5', ...ACCENTS.slice(0, 9)]

export default function EmbedBuilder({ onSend, onClose }) {
  const [e, setE] = useState({ t: '', u: '', d: '', c: '#6475f5', i: '', th: '', f: '', fl: [] })
  const set = (k, v) => setE((x) => ({ ...x, [k]: v }))
  const encoded = useMemo(() => encodeEmbed(e), [e])
  const view = useMemo(() => parseEmbed(encoded), [encoded])
  const empty = !e.t && !e.d && !e.i && !e.f && !e.fl.some((x) => x[0] && x[1])
  const tooLong = encoded.length > EMBED_MAX
  const bad = ['u', 'i', 'th'].filter((k) => e[k] && !/^https:\/\/\S{3,300}$/.test(e[k]))
  const setField = (i, j, v) => setE((x) => ({ ...x, fl: x.fl.map((f, n) => (n === i ? f.map((c, m) => (m === j ? v : c)) : f)) }))

  return (
    <Modal title="Build an embed" onClose={onClose} wide>
      <div className="form embed-form">
        <label>Title<input value={e.t} maxLength={80} onChange={(x) => set('t', x.target.value)} placeholder="Big headline" autoFocus /></label>
        <label>Description<textarea rows={4} value={e.d} maxLength={500} onChange={(x) => set('d', x.target.value)} placeholder="Supports **bold**, *italic*, [links](https://example.com) and more" /></label>
        <div className="eb-colors" role="radiogroup" aria-label="Side colour">
          {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={e.c === c} className="swatch" style={{ background: c }} aria-label={c} onClick={() => set('c', c)} />)}
        </div>
        <div className="section">Fields (up to 4)</div>
        {e.fl.map((f, i) => (
          <div className="row nowrap" key={i}>
            <input value={f[0]} maxLength={30} placeholder="Name" onChange={(x) => setField(i, 0, x.target.value)} aria-label={`Field ${i + 1} name`} />
            <input value={f[1]} maxLength={100} placeholder="Value" onChange={(x) => setField(i, 1, x.target.value)} aria-label={`Field ${i + 1} value`} />
            <button type="button" className="icon-btn" aria-label="Remove field" onClick={() => setE((x) => ({ ...x, fl: x.fl.filter((_, n) => n !== i) }))}>✕</button>
          </div>
        ))}
        {e.fl.length < 4 && <button type="button" className="ghost small" onClick={() => setE((x) => ({ ...x, fl: [...x.fl, ['', '']] }))}>+ Add a field</button>}
        <div className="section">Pictures and links (https only)</div>
        <input value={e.i} onChange={(x) => set('i', x.target.value)} placeholder="Large image link" aria-label="Large image link" />
        <input value={e.th} onChange={(x) => set('th', x.target.value)} placeholder="Small picture link (top right)" aria-label="Small picture link" />
        <input value={e.u} onChange={(x) => set('u', x.target.value)} placeholder="Make the title a link" aria-label="Title link" />
        <input value={e.f} maxLength={60} onChange={(x) => set('f', x.target.value)} placeholder="Footer text" aria-label="Footer" />
        {bad.length > 0 && <div className="error" role="alert">Links must start with https://</div>}
        <div className="section">Preview</div>
        <div className="embed-preview">{!empty && view ? <EmbedView e={view} ctx={null} /> : <span className="muted small">Fill something in to see it here.</span>}</div>
        <p className="muted tiny">Pictures load from the address you give, so only use ones you trust. {tooLong && <strong className="danger-text">That is too long to send. Shorten it a little.</strong>}</p>
      </div>
      <div className="modal-foot">
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={empty || tooLong || bad.length > 0} onClick={() => { onSend(encoded); onClose() }}>Send embed</button>
      </div>
    </Modal>
  )
}
