import { useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import ColorPicker, { ACCENTS, BANNERS } from './ColorPicker.jsx'
import { CardBody } from './ProfileUI.jsx'
import { FRAMES, TINTABLE, NAME_FONTS, CARD_THEMES, Name, themeColors } from '../cosmetics.jsx'
import { STATUSES } from '../status.js'
import { normalizeUrl } from '../socials.js'

/* The profile and style tabs of Settings: sections on the left, a live preview on the right (card, chat or member list). */

// One-click looks. Every id here exists in cosmetics.jsx (and so in the database constraints).
const LOOKS = [
  ['clean', 'Clean', { frame: 'none', name_font: 'default', card_theme: 'default', name_color2: '', frame_color: '' }],
  ['ocean', 'Ocean', { frame: 'ring', frame_color: '#3e8bff', name_font: 'round', card_theme: 'ocean', accent_color: '#7cc4ff', name_color2: '#3e8bff' }],
  ['sunset', 'Sunset', { frame: 'sunset', frame_color: '', name_font: 'bold', card_theme: 'sunset', accent_color: '#ffb86b', name_color2: '#ff5d8f' }],
  ['neon', 'Neon', { frame: 'neon', frame_color: '#43d17a', name_font: 'mono', card_theme: 'night', accent_color: '#43d17a', name_color2: '#3ee0ff' }],
  ['candy', 'Candy', { frame: 'candy', frame_color: '', name_font: 'round', card_theme: 'candy', accent_color: '#ff8cd0', name_color2: '#c58cff' }],
  ['gold', 'Gold', { frame: 'gold', frame_color: '', name_font: 'serif', card_theme: 'night', accent_color: '#f5c542', name_color2: '' }],
]
const STYLE_KEYS = ['frame', 'frame_color', 'name_font', 'card_theme', 'accent_color', 'name_color2', 'banner_color']

function Section({ title, hint, children, action }) {
  return (
    <section className="pc-sec">
      <header><h3>{title}</h3>{action}</header>
      {hint && <p className="muted tiny pc-hint">{hint}</p>}
      {children}
    </section>
  )
}

function Counter({ value, max }) {
  return <span className={'pc-count' + (value.length > max * 0.9 ? ' warn' : '')}>{value.length}/{max}</span>
}

/* Banner with the picture on top of it: click either to change it. */
function Hero({ preview, form, setForm, pick, busy }) {
  const bannerIn = useRef(null)
  const avatarIn = useRef(null)
  const theme = themeColors(form.card_theme)
  const bg = form.banner_url ? { backgroundImage: `url(${form.banner_url})` } : { background: theme ? `linear-gradient(135deg, ${theme[0]}, ${theme[1]})` : form.banner_color }
  const file = (ref, kind) => (
    <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(kind, f) }} />
  )
  return (
    <div className="pc-hero">
      {file(bannerIn, 'banner')}{file(avatarIn, 'avatar')}
      <button type="button" className="pc-banner" style={bg} onClick={() => bannerIn.current?.click()} aria-label="Change banner" disabled={busy === 'banner'}>
        <span className="pc-over"><Icon name="image" size={16} />{busy === 'banner' ? 'Uploading…' : form.banner_url ? 'Change banner' : 'Add a banner'}</span>
      </button>
      <button type="button" className="pc-avatar" onClick={() => avatarIn.current?.click()} aria-label="Change profile picture" disabled={busy === 'avatar'}>
        <Avatar profile={preview} size={84} />
        <span className="pc-over round"><Icon name="image" size={18} /></span>
      </button>
      <div className="pc-hero-tools">
        {form.banner_url && <button type="button" className="ghost small" onClick={() => setForm((f) => ({ ...f, banner_url: null }))}>Remove banner</button>}
        {form.avatar_url && <button type="button" className="ghost small" onClick={() => setForm((f) => ({ ...f, avatar_url: null }))}>Remove picture</button>}
      </div>
      <p className="muted tiny pc-hero-note">PNG, JPG, GIF or WebP up to 8 MB. Animated images stay animated.</p>
    </div>
  )
}

function Previews({ preview, links, view, setView }) {
  const sam = { id: 'sam', username: 'sam', display_name: 'Sam', accent_color: '#7cc4ff' }
  const withLinks = { ...preview, socials: links.map(normalizeUrl).filter(Boolean).map((url) => ({ url })) }
  const st = STATUSES.find((s) => s.id === preview.status)
  return (
    <aside className="pc-preview" aria-label="Preview">
      <div className="seg" role="tablist" aria-label="Preview">
        {[['card', 'Card'], ['chat', 'Chat'], ['list', 'Members']].map(([id, l]) => <button key={id} role="tab" type="button" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>)}
      </div>
      {view === 'card' && <CardBody profile={withLinks} founder={false} size={72} flat />}
      {view === 'chat' && (
        <div className="pc-surface pc-chat">
          <div className="pv-msg"><Avatar profile={sam} size={36} /><div><div className="pv-head"><Name profile={sam} /><span className="muted tiny">Today at 12:46</span></div><p>Game night later?</p></div></div>
          <div className="pv-msg"><Avatar profile={preview} size={36} /><div><div className="pv-head"><Name profile={preview} /><span className="muted tiny">Today at 12:48</span></div><p>Yes! I'll bring snacks.</p></div></div>
        </div>
      )}
      {view === 'list' && (
        <div className="pc-surface pc-list">
          <div className="pv-label">Online, 2</div>
          <div className="pv-row"><Avatar profile={sam} size={32} status /><span className="pv-who"><Name profile={sam} /></span></div>
          <div className="pv-row on"><Avatar profile={preview} size={32} status /><span className="pv-who"><Name profile={preview} /><small className="muted">{preview.status_text || st?.label || ''}</small></span></div>
        </div>
      )}
    </aside>
  )
}

export default function ProfileCustomize({ tab, form, setForm, links, setLinks, busy, pick, error, preview, profile, dirty, onSave, onCancel, nameError }) {
  const [view, setView] = useState('card')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const shown = links.filter((l) => l.trim()).length
  const looked = LOOKS.find(([, , v]) => Object.entries(v).every(([k, x]) => (form[k] || '') === x))?.[0]
  const surprise = () => {
    const [, , v] = LOOKS[1 + Math.floor(Math.random() * (LOOKS.length - 1))]
    const frames = FRAMES.map((f) => f[0]).filter((f) => f !== 'none')
    const accent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)]
    setForm((f) => ({ ...f, ...v, frame: frames[Math.floor(Math.random() * frames.length)], accent_color: accent, name_color2: ACCENTS[Math.floor(Math.random() * ACCENTS.length)] }))
  }
  const resetStyle = () => setForm((f) => ({ ...f, ...Object.fromEntries(STYLE_KEYS.map((k) => [k, profile[k] ?? (k === 'frame' ? 'none' : k === 'name_font' ? 'font' : '')])), frame: profile.frame || 'none', name_font: profile.name_font || 'default', card_theme: profile.card_theme || 'default', name_color2: profile.name_color2 || '', frame_color: profile.frame_color || '' }))
  return (
    <>
      <div className="pc">
        <div className="pc-main">
          {tab === 'profile' ? (
            <>
              <Hero preview={preview} form={form} setForm={setForm} pick={pick} busy={busy} />
              <Section title="About you">
                <label className="pc-field">Display name <Counter value={form.display_name} max={32} />
                  <input value={form.display_name} onChange={set('display_name')} maxLength={32} aria-invalid={!!nameError} />
                  {nameError && <span className="pc-err">{nameError}</span>}
                </label>
                <label className="pc-field">Pronouns<Counter value={form.pronouns || ''} max={20} />
                  <input value={form.pronouns || ''} onChange={set('pronouns')} maxLength={20} placeholder="she/her, he/him, they/them…" />
                </label>
                <label className="pc-field">About me <Counter value={form.bio || ''} max={200} />
                  <textarea value={form.bio || ''} onChange={set('bio')} maxLength={200} rows={3} placeholder="Tell people a little about you" />
                </label>
              </Section>
              <Section title="Status" hint="Others see this next to your name.">
                <div className="pc-status" role="radiogroup" aria-label="Status">
                  {STATUSES.map((s) => (
                    <button type="button" key={s.id} role="radio" aria-checked={form.status === s.id} className={form.status === s.id ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, status: s.id }))} title={s.desc}>
                      <i style={{ background: s.color }} />{s.label}
                    </button>
                  ))}
                </div>
                <label className="pc-field">Status message <Counter value={form.status_text || ''} max={60} />
                  <input value={form.status_text || ''} onChange={set('status_text')} maxLength={60} placeholder="What are you up to?" />
                </label>
              </Section>
              <Section title="Links" hint={`Up to 5, shown on your card. ${shown}/5 used.`}>
                <div className="links-edit">
                  {links.map((l, i) => {
                    const bad = l.trim() && !normalizeUrl(l)
                    return (
                      <div className={'link-input' + (bad ? ' bad' : '')} key={i}>
                        <Icon name="link" size={14} />
                        <input value={l} onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'youtube.com/@you' : 'Another link'} maxLength={200} autoCapitalize="none" spellCheck="false" aria-label={`Link ${i + 1}`} aria-invalid={!!bad} />
                      </div>
                    )
                  })}
                </div>
              </Section>
            </>
          ) : (
            <>
              <Section title="Quick looks" hint="Start from a look, then change anything below." action={<button type="button" className="ghost small" onClick={surprise}><Icon name="sparkle" size={14} /> Surprise me</button>}>
                <div className="pc-looks">
                  {LOOKS.map(([id, label, v]) => {
                    const t = themeColors(v.card_theme)
                    return (
                      <button type="button" key={id} className={looked === id ? 'on' : ''} aria-pressed={looked === id} onClick={() => setForm((f) => ({ ...f, ...v, accent_color: v.accent_color || f.accent_color }))}>
                        <span className="pc-look-bar" style={{ background: t ? `linear-gradient(135deg, ${t[0]}, ${t[1]})` : form.banner_color }} />
                        <Name profile={{ display_name: label, accent_color: v.accent_color || form.accent_color, name_color2: v.name_color2 || '', name_font: v.name_font }} />
                      </button>
                    )
                  })}
                </div>
              </Section>
              <Section title="Avatar frame">
                <div className="opt-grid">
                  {FRAMES.map(([id, label]) => (
                    <button type="button" key={id} className={`opt ${form.frame === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, frame: id }))} aria-pressed={form.frame === id}>
                      <Avatar profile={{ ...preview, frame: id, frame_color: TINTABLE.has(id) ? form.frame_color : '', avatar_url: null }} size={40} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <ColorPicker label={`Frame colour${TINTABLE.has(form.frame) ? '' : ' (only for Ring, Neon, Orbit and Pulse)'}`} value={form.frame_color} presets={ACCENTS} noneLabel="Default" onChange={(v) => setForm((f) => ({ ...f, frame_color: v }))} />
              </Section>
              <Section title="Name">
                <div className="opt-grid wide">
                  {NAME_FONTS.map(([id, label]) => (
                    <button type="button" key={id} className={`opt ${form.name_font === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, name_font: id }))} aria-pressed={form.name_font === id}>
                      <Name profile={{ ...preview, name_font: id, display_name: label }} />
                    </button>
                  ))}
                </div>
                <div className="colors-stack">
                  <ColorPicker label="Name colour" value={form.accent_color} presets={ACCENTS} onChange={(v) => setForm((f) => ({ ...f, accent_color: v }))} />
                  <ColorPicker label="Name gradient (second colour)" value={form.name_color2} presets={ACCENTS} noneLabel="No gradient" onChange={(v) => setForm((f) => ({ ...f, name_color2: v }))} />
                </div>
              </Section>
              <Section title="Profile card">
                <div className="opt-grid wide">
                  {CARD_THEMES.map(([id, label, [c1, c2]]) => (
                    <button type="button" key={id} className={`opt theme ${form.card_theme === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, card_theme: id }))} aria-pressed={form.card_theme === id}>
                      <span className="theme-chip" style={{ background: id === 'default' ? form.banner_color : `linear-gradient(135deg, ${c1}, ${c2})` }} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <ColorPicker label={form.card_theme === 'default' ? 'Banner colour' : 'Banner colour (used when the card theme is "Your banner")'} value={form.banner_color} presets={BANNERS} onChange={(v) => setForm((f) => ({ ...f, banner_color: v }))} />
              </Section>
              <button type="button" className="ghost small pc-reset" onClick={resetStyle}>Undo style changes</button>
            </>
          )}
          {error && <div className="error" role="alert">{error}</div>}
        </div>
        <Previews preview={preview} links={links} view={view} setView={setView} />
      </div>
      <div className="modal-foot pc-foot">
        <span className={'pc-dirty' + (dirty ? ' on' : '')} role="status">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <button className="ghost" onClick={onCancel}>{dirty ? 'Discard' : 'Close'}</button>
        <button className="primary" onClick={onSave} disabled={Boolean(busy) || !dirty || !!nameError}>Save changes</button>
      </div>
    </>
  )
}
