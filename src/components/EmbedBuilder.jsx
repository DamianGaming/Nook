import { useMemo, useState } from 'react'
import { Modal } from './Modals.jsx'
import { EmbedView, encodeEmbed, parseEmbed, EMBED_MAX, EMBED_FIELDS, EMBED_LINKS } from '../embeds.jsx'
import { ACCENTS } from './ColorPicker.jsx'
import Icon from './Icon.jsx'

const COLORS = ['#6475f5', ...ACCENTS.slice(0, 9)]
const isUrl = (u) => /^https:\/\/\S{3,300}$/.test(u)

function Section({ title, hint, children, open = false }) {
  return (
    <details className="eb-section" open={open}>
      <summary><span>{title}</span>{hint && <span className="muted tiny">{hint}</span>}</summary>
      <div className="eb-body">{children}</div>
    </details>
  )
}

export default function EmbedBuilder({ onSend, onClose }) {
  const [e, setE] = useState({ x: '', an: '', ai: '', au: '', t: '', u: '', d: '', c: '#6475f5', i: '', th: '', f: '', fi: '', ts: false, fl: [], bl: [], dl: [{ ph: '', o: [] }] })
  const set = (k, v) => setE((x) => ({ ...x, [k]: v }))
  const encoded = useMemo(() => encodeEmbed(e), [e])
  const view = useMemo(() => parseEmbed(encoded), [encoded])
  const empty = !e.x && !e.an && !e.t && !e.d && !e.i && !e.f && !e.fl.some((x) => x[0] && x[1]) && !e.bl.some((b) => b[0] && b[1]) && !e.dl[0].o.some((o) => o[0] && o[1])
  const tooLong = encoded.length > EMBED_MAX
  const bad = ['u', 'i', 'th', 'ai', 'au', 'fi'].filter((k) => e[k] && !isUrl(e[k])).length + e.bl.filter((b) => /^https?:/i.test(b[1]) && !isUrl(b[1])).length > 0
  const setList = (key, i, j, v) => setE((x) => ({ ...x, [key]: x[key].map((f, n) => (n === i ? f.map((c, m) => (m === j ? v : c)) : f)) }))
  const drop = (key, i) => setE((x) => ({ ...x, [key]: x[key].filter((_, n) => n !== i) }))
  const url = (k, label, ph) => <label>{label}<input value={e[k]} onChange={(x) => set(k, x.target.value)} placeholder={ph || 'https://…'} inputMode="url" /></label>

  return (
    <Modal title="Build an embed" onClose={onClose} wide>
      <div className="embed-builder">
        <div className="form embed-form">
          <label>Title<input value={e.t} maxLength={120} onChange={(x) => set('t', x.target.value)} placeholder="Big headline" autoFocus /></label>
          <label>Description<textarea rows={4} value={e.d} maxLength={1500} onChange={(x) => set('d', x.target.value)} placeholder="Supports **bold**, *italic*, ||spoilers||, [links](https://example.com) and more" /></label>
          <div className="eb-colors" role="radiogroup" aria-label="Side colour">
            {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={e.c === c} className="swatch" style={{ background: c }} aria-label={c} onClick={() => set('c', c)} />)}
          </div>

          <Section title="Buttons" hint={`up to ${EMBED_LINKS}`} open={e.bl.length > 0}>
            <p className="muted tiny">Put a link (https://…) to open it, or write a short note to show it to whoever presses the button. Buttons that run code need a bot.</p>
            {e.bl.map((b, i) => (
              <div className="row nowrap" key={i}>
                <input value={b[0]} maxLength={40} placeholder="Button text" onChange={(x) => setList('bl', i, 0, x.target.value)} aria-label={`Button ${i + 1} text`} />
                <input value={b[1]} placeholder="https://… or a note" maxLength={300} onChange={(x) => setList('bl', i, 1, x.target.value)} aria-label={`Button ${i + 1} link or note`} />
                <button type="button" className="icon-btn" aria-label="Remove button" onClick={() => drop('bl', i)}><Icon name="x" size={16} /></button>
              </div>
            ))}
            {e.bl.length < EMBED_LINKS && <button type="button" className="ghost small" onClick={() => setE((x) => ({ ...x, bl: [...x.bl, ['', '']] }))}><Icon name="plus" size={14} /> Add a button</button>}
          </Section>

          <Section title="Dropdown" hint="a menu with answers or links" open={e.dl[0].o.length > 0}>
            <p className="muted tiny">Each option shows its answer (or opens a link) to the person who picks it. Good for FAQs and rules.</p>
            <input value={e.dl[0].ph} maxLength={60} placeholder="Placeholder, e.g. Pick a topic" aria-label="Dropdown placeholder" onChange={(x) => setE((v) => ({ ...v, dl: [{ ...v.dl[0], ph: x.target.value }] }))} />
            {e.dl[0].o.map((o, i) => (
              <div className="row nowrap" key={i}>
                <input value={o[0]} maxLength={60} placeholder="Option" aria-label={`Option ${i + 1} name`} onChange={(x) => setE((v) => ({ ...v, dl: [{ ...v.dl[0], o: v.dl[0].o.map((r, n) => (n === i ? [x.target.value, r[1]] : r)) }] }))} />
                <input value={o[1]} maxLength={300} placeholder="Answer or https:// link" aria-label={`Option ${i + 1} answer`} onChange={(x) => setE((v) => ({ ...v, dl: [{ ...v.dl[0], o: v.dl[0].o.map((r, n) => (n === i ? [r[0], x.target.value] : r)) }] }))} />
                <button type="button" className="icon-btn" aria-label="Remove option" onClick={() => setE((v) => ({ ...v, dl: [{ ...v.dl[0], o: v.dl[0].o.filter((_, n) => n !== i) }] }))}><Icon name="x" size={16} /></button>
              </div>
            ))}
            {e.dl[0].o.length < 10 && <button type="button" className="ghost small" onClick={() => setE((v) => ({ ...v, dl: [{ ...v.dl[0], o: [...v.dl[0].o, ['', '']] }] }))}><Icon name="plus" size={14} /> Add an option</button>}
          </Section>

          <Section title="Fields" hint={`up to ${EMBED_FIELDS}`} open={e.fl.length > 0}>
            {e.fl.map((f, i) => (
              <div className="eb-field" key={i}>
                <div className="row nowrap">
                  <input value={f[0]} maxLength={40} placeholder="Name" onChange={(x) => setList('fl', i, 0, x.target.value)} aria-label={`Field ${i + 1} name`} />
                  <input value={f[1]} maxLength={200} placeholder="Value" onChange={(x) => setList('fl', i, 1, x.target.value)} aria-label={`Field ${i + 1} value`} />
                  <button type="button" className="icon-btn" aria-label="Remove field" onClick={() => drop('fl', i)}><Icon name="x" size={16} /></button>
                </div>
                <label className="eb-inline"><input type="checkbox" checked={!!f[2]} onChange={(x) => setList('fl', i, 2, x.target.checked)} /> Show next to the other fields</label>
              </div>
            ))}
            {e.fl.length < EMBED_FIELDS && <button type="button" className="ghost small" onClick={() => setE((x) => ({ ...x, fl: [...x.fl, ['', '', false]] }))}><Icon name="plus" size={14} /> Add a field</button>}
          </Section>

          <Section title="Author and text above" open={!!(e.an || e.x)}>
            <label>Text above the card<input value={e.x} maxLength={500} onChange={(x) => set('x', x.target.value)} placeholder="A normal message shown above the embed" /></label>
            <label>Author name<input value={e.an} maxLength={60} onChange={(x) => set('an', x.target.value)} placeholder="Small name at the top" /></label>
            {url('ai', 'Author picture')}
            {url('au', 'Author link')}
          </Section>

          <Section title="Pictures and links" hint="https only" open={!!(e.i || e.th || e.u)}>
            {url('i', 'Large image')}
            {url('th', 'Small picture (top right)')}
            {url('u', 'Make the title a link')}
          </Section>

          <Section title="Footer" open={!!(e.f || e.ts)}>
            <label>Footer text<input value={e.f} maxLength={80} onChange={(x) => set('f', x.target.value)} placeholder="Small text at the bottom" /></label>
            {url('fi', 'Footer picture')}
            <label className="eb-inline"><input type="checkbox" checked={e.ts} onChange={(x) => set('ts', x.target.checked)} /> Show the time it was sent</label>
          </Section>
          {bad && <div className="error" role="alert">Links must start with https://</div>}
          <p className="muted tiny">Pictures load from the address you give, so only use ones you trust. {tooLong && <strong className="danger-text">That is too long to send. Shorten it a little.</strong>}</p>
        </div>
        <div className="embed-side">
          <div className="section">Preview</div>
          <div className="embed-preview">{!empty && view ? <EmbedView e={view} ctx={null} /> : <span className="muted small">Fill something in to see it here.</span>}</div>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={empty || tooLong || bad} onClick={() => { onSend(encoded); onClose() }}>Send embed</button>
      </div>
    </Modal>
  )
}
