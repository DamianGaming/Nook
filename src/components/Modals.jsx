import { confirmDialog, promptDialog, notify as toast } from '../dialog.jsx'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { usePrefs, setPrefs } from '../prefs.js'
import Mascot from './Mascot.jsx'
import { normalizeUrl, linksOf, hostLabel } from '../socials.js'
import { FRAMES, TINTABLE, NAME_FONTS, CARD_THEMES, Name } from '../cosmetics.jsx'
import { CardBody } from './ProfileUI.jsx'
import ColorPicker, { ACCENTS, BANNERS } from './ColorPicker.jsx'
import { supabase } from '../supabase.js'
import { uploadMedia, removeMedia } from '../upload.js'
import Avatar, { GroupIcon } from './Avatar.jsx'
import Icon from './Icon.jsx'
import { loadCustomEmoji } from '../emoji.js'
const TwoFactorPanel = lazy(() => import('./TwoFactor.jsx').then((m) => ({ default: m.TwoFactorPanel })))
const EncryptionPanel = lazy(() => import('./Encryption.jsx').then((m) => ({ default: m.EncryptionPanel })))

const VoiceSettingsBody = lazy(() => import('./VoiceSettings.jsx').then((m) => ({ default: m.VoiceSettingsBody })))
const SETTINGS_TABS = [
  ['profile', 'user', 'My profile'],
  ['style', 'sparkle', 'Profile style'],
  ['account', 'key', 'Account'],
  ['voice', 'headphones', 'Voice and video'],
  ['notify', 'bell', 'Notifications'],
  ['privacy', 'ban', 'Privacy and safety'],
  ['about', 'heart', 'About'],
]

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function RulesModal({ onClose }) {
  return (
    <Modal title="Rules, privacy and terms" onClose={onClose}>
      <div className="form prose">
        <p className="muted">Nook is built to be a friendly place for everyone. These pages explain how it works and what we expect.</p>
        <div className="legal-list">
          <a className="legal-row" href="#/rules" onClick={onClose}><Icon name="shield" size={16} /><span><strong>Community guidelines</strong><small>What is and is not okay here</small></span></a>
          <a className="legal-row" href="#/terms" onClick={onClose}><Icon name="copy2" size={16} /><span><strong>Terms of Service</strong><small>The agreement for using Nook</small></span></a>
          <a className="legal-row" href="#/privacy" onClick={onClose}><Icon name="lock" size={16} /><span><strong>Privacy Policy</strong><small>What we store, why, and your choices</small></span></a>
          <a className="legal-row" href="#/safety" onClick={onClose}><Icon name="heart" size={16} /><span><strong>Safety centre</strong><small>Reporting, blocking and getting help</small></span></a>
          <a className="legal-row" href="#/copyright" onClick={onClose}><Icon name="flag" size={16} /><span><strong>Copyright and takedowns</strong><small>Report content that infringes your rights</small></span></a>
        </div>
      </div>
    </Modal>
  )
}

const STATUSES = [
  ['online', 'Online'],
  ['idle', 'Idle'],
  ['dnd', 'Do not disturb'],
  ['invisible', 'Invisible'],
]

function FilePick({ label, onFile, busy }) {
  const ref = useRef(null)
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <button type="button" className="ghost small" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="upload" size={14} /> {busy ? 'Uploading…' : label}
      </button>
    </>
  )
}

export function ProfileEditor({ profile, onClose, onSaved, onSignOut, initialTab = 'profile' }) {
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState({
    display_name: profile.display_name,
    bio: profile.bio,
    pronouns: profile.pronouns,
    accent_color: profile.accent_color,
    banner_color: profile.banner_color,
    avatar_url: profile.avatar_url || null,
    banner_url: profile.banner_url || null,
    status: profile.status,
    status_text: profile.status_text,
    frame: profile.frame || 'none',
    name_color2: profile.name_color2 || '',
    frame_color: profile.frame_color || '',
    name_font: profile.name_font || 'default',
    card_theme: profile.card_theme || 'default',
  })
  const [links, setLinks] = useState(() => [...linksOf(profile).map((l) => l.url), '', '', '', '', ''].slice(0, 5))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // account tab
  const [username, setUsername] = useState(profile.username)
  const [pw, setPw] = useState('')
  const [accMsg, setAccMsg] = useState('')
  const [accErr, setAccErr] = useState('')
  const [notify, setNotify] = useState(localStorage.getItem('nook-notify') === '1')
  const [blocked, setBlocked] = useState([])
  const [confirmDel, setConfirmDel] = useState('')
  const [rules, setRules] = useState(false)

  async function loadBlocked() {
    const { data: b } = await supabase.from('blocks').select('blocked').eq('blocker', profile.id)
    if (!b?.length) return setBlocked([])
    const { data: p } = await supabase.from('profiles').select('id, username, display_name').in('id', b.map((x) => x.blocked))
    setBlocked(p || [])
  }
  useEffect(() => {
    loadBlocked()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(kind, file) {
    setError('')
    setBusy(kind)
    try {
      const url = await uploadMedia(profile.id, file, kind)
      setForm((f) => ({ ...f, [kind === 'avatar' ? 'avatar_url' : 'banner_url']: url }))
    } catch (e) {
      setError(e.message)
    }
    setBusy('')
  }

  async function save() {
    const clean = links.map(normalizeUrl).filter(Boolean)
    if (links.some((l) => l.trim()) && clean.length !== links.filter((l) => l.trim()).length) return setError('One of your links does not look right. Use a full web address.')
    const payload = { ...form, name_color2: form.name_color2 || null, frame_color: form.frame_color || null }
    let { error } = await supabase.from('profiles').update({ ...payload, socials: clean.map((url) => ({ url })) }).eq('id', profile.id)
    if (error && /socials/i.test(error.message)) {
      // The links column comes from update_v8.sql; until it has been run, everything else still saves.
      ;({ error } = await supabase.from('profiles').update(form).eq('id', profile.id))
      if (!error && clean.length) toast('Saved, but links need update_v8.sql to be run first.', 'error')
    }
    if (error && /frame|name_color2|name_font|card_theme/i.test(error.message)) {
      // Style options come from update_v9.sql; until it has been run, the rest of the profile still saves.
      const { frame, frame_color, name_color2, name_font, card_theme, ...rest } = form
      ;({ error } = await supabase.from('profiles').update({ ...rest, socials: clean.map((url) => ({ url })) }).eq('id', profile.id))
      if (!error) toast('Saved, but profile styles need update_v9.sql and update_v10.sql to be run first.', 'error')
    }
    if (error) return setError(error.message)
    if (profile.avatar_url && profile.avatar_url !== form.avatar_url) removeMedia(profile.avatar_url)
    if (profile.banner_url && profile.banner_url !== form.banner_url) removeMedia(profile.banner_url)
    onSaved()
    onClose()
  }

  async function saveUsername() {
    setAccErr('')
    setAccMsg('')
    const u = username.trim().toLowerCase()
    if (u === profile.username) return
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return setAccErr('Username: 3–20 letters, numbers or underscores.')
    const { error } = await supabase.from('profiles').update({ username: u }).eq('id', profile.id)
    if (error) return setAccErr(error.code === '23505' ? 'That username is taken.' : error.message)
    setAccMsg('Username updated.')
    onSaved()
  }

  async function savePassword() {
    setAccErr('')
    setAccMsg('')
    if (pw.length < 8) return setAccErr('Password must be at least 8 characters.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setAccErr(error.message)
    setPw('')
    setAccMsg('Password changed.')
  }

  async function toggleNotify(on) {
    if (on) {
      if (!('Notification' in window)) return setAccErr('This browser does not support notifications.')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return setAccErr('Notifications are blocked in your browser settings.')
    }
    localStorage.setItem('nook-notify', on ? '1' : '0')
    setNotify(on)
  }

  async function unblock(id) {
    await supabase.from('blocks').delete().eq('blocker', profile.id).eq('blocked', id)
    loadBlocked()
  }

  async function deleteAccount() {
    if (confirmDel !== profile.username) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return setAccErr(error.message)
    await supabase.auth.signOut()
  }

  const preview = { ...profile, ...form }
  const prefs = usePrefs()
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_TABS.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon name={icon} size={15} /> <span>{label}</span></button>
          ))}
          {onSignOut && <button className="out" onClick={onSignOut}><Icon name="logout" size={15} /> <span>Sign out</span></button>}
        </nav>
        <div className="settings-pane" key={tab}>
      {tab === 'profile' || tab === 'style' ? (
        <>
          <div className="editor">
            <div className="editor-form form">
              {tab === 'style' ? (
                <>
                  <div className="label">Avatar frame</div>
                  <div className="opt-grid">
                    {FRAMES.map(([id, label]) => (
                      <button type="button" key={id} className={`opt ${form.frame === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, frame: id }))} aria-pressed={form.frame === id}>
                        <span className="avatar frame-demo" data-frame={id === 'none' ? undefined : id} style={{ '--fw': '3px', '--fg': '2px' }}><span className="avatar-face" style={{ background: `linear-gradient(135deg, ${form.accent_color}, #c58cff)` }} /></span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="label">Name font</div>
                  <div className="opt-grid wide">
                    {NAME_FONTS.map(([id, label]) => (
                      <button type="button" key={id} className={`opt ${form.name_font === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, name_font: id }))} aria-pressed={form.name_font === id}>
                        <Name profile={{ ...preview, name_color2: null, name_font: id, display_name: label }} />
                      </button>
                    ))}
                  </div>
                  <div className="label">Card theme</div>
                  <div className="opt-grid wide">
                    {CARD_THEMES.map(([id, label, [c1, c2]]) => (
                      <button type="button" key={id} className={`opt theme ${form.card_theme === id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, card_theme: id }))} aria-pressed={form.card_theme === id}>
                        <span className="theme-chip" style={{ background: id === 'default' ? form.banner_color : `linear-gradient(135deg, ${c1}, ${c2})` }} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="label">Colours</div>
                  <div className="colors-stack">
                    <ColorPicker label="Name colour" value={form.accent_color} presets={ACCENTS} onChange={(v) => setForm((f) => ({ ...f, accent_color: v }))} />
                    <ColorPicker label="Name gradient (second colour)" value={form.name_color2} presets={ACCENTS} noneLabel="No gradient" onChange={(v) => setForm((f) => ({ ...f, name_color2: v }))} />
                    <ColorPicker label={`Frame colour${TINTABLE.has(form.frame) ? '' : ' (Ring, Neon, Orbit and Pulse)'}`} value={form.frame_color} presets={ACCENTS} noneLabel="Default" onChange={(v) => setForm((f) => ({ ...f, frame_color: v }))} />
                    <ColorPicker label="Banner colour" value={form.banner_color} presets={BANNERS} onChange={(v) => setForm((f) => ({ ...f, banner_color: v }))} />
                  </div>
                </>
              ) : (
              <>
              <div className="label">Profile picture</div>
              <div className="row">
                <FilePick label="Upload" onFile={(f) => pick('avatar', f)} busy={busy === 'avatar'} />
                {form.avatar_url && <button type="button" className="ghost small" onClick={() => setForm({ ...form, avatar_url: null })}>Remove</button>}
              </div>
              <div className="label">Banner</div>
              <div className="row">
                <FilePick label="Upload" onFile={(f) => pick('banner', f)} busy={busy === 'banner'} />
                {form.banner_url && <button type="button" className="ghost small" onClick={() => setForm({ ...form, banner_url: null })}>Remove</button>}
              </div>
              <div className="hint">PNG, JPG, GIF or WebP up to 8 MB. Animated images stay animated.</div>

              <label>Display name<input value={form.display_name} onChange={set('display_name')} maxLength={32} /></label>
              <label>Pronouns<input value={form.pronouns} onChange={set('pronouns')} maxLength={20} placeholder="Optional" /></label>
              <label>About me<textarea value={form.bio} onChange={set('bio')} maxLength={200} rows={3} /></label>
              <div className="row two">
                <label>Status
                  <select value={form.status} onChange={set('status')}>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label>Status message<input value={form.status_text} onChange={set('status_text')} maxLength={60} placeholder="What are you up to?" /></label>
              </div>
              <div className="label">Social links <span className="muted tiny">up to 5, shown on your profile</span></div>
              <div className="links-edit">
                {links.map((l, i) => (
                  <div className="link-input" key={i}>
                    <Icon name="link" size={14} />
                    <input value={l} onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'youtube.com/@you' : 'Another link'} maxLength={200} autoCapitalize="none" spellCheck="false" aria-label={`Link ${i + 1}`} />
                  </div>
                ))}
              </div>
              </>
              )}
              {error && <div className="error">{error}</div>}
            </div>

            <div className="editor-preview">
              <div className="label">Preview</div>
              <CardBody profile={{ ...preview, socials: links.map(normalizeUrl).filter(Boolean).map((url) => ({ url })) }} founder={false} size={72} flat />
            </div>
          </div>
          <div className="modal-foot">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save} disabled={Boolean(busy)}>Save changes</button>
          </div>
        </>
            ) : tab === 'account' ? (
        <div className="form account">
          <div className="section">Username</div>
          <div className="row nowrap">
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={20} />
            <button className="ghost" onClick={saveUsername} disabled={username === profile.username}>Change</button>
          </div>
          <div className="hint">Usernames can be changed once every 14 days.</div>

          <div className="section">Password</div>
          <div className="row nowrap">
            <input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            <button className="ghost" onClick={savePassword} disabled={!pw}>Update</button>
          </div>
          {(accErr || accMsg) && <div className={accErr ? 'error' : 'info'}>{accErr || accMsg}</div>}

          <div className="section danger-zone">Delete account</div>
          <div className="hint">This permanently removes your profile and messages. Groups you founded pass to the longest-standing member, or are deleted if you are the only member. Type <code>{profile.username}</code> to confirm.</div>
          <div className="row nowrap">
            <input value={confirmDel} onChange={(e) => setConfirmDel(e.target.value)} placeholder={profile.username} />
            <button className="ghost danger" disabled={confirmDel !== profile.username} onClick={deleteAccount}>Delete</button>
          </div>
        </div>
      ) : tab === 'voice' ? (
        <Suspense fallback={<div className="form muted">Loading…</div>}><VoiceSettingsBody /></Suspense>
      ) : tab === 'notify' ? (
        <div className="form account">
          <div className="section">Notifications</div>
          <label className="switch-row">
            <span>Desktop notifications<span className="muted tiny">Alerts for new messages and calls when Nook is in the background.</span></span>
            <input type="checkbox" className="switch" checked={notify} onChange={(e) => toggleNotify(e.target.checked)} />
          </label>
          <div className="section">Sounds</div>
          <label className="switch-row">
            <span>Call and message sounds<span className="muted tiny">Joining, leaving, muting, ringing and new messages.</span></span>
            <input type="checkbox" className="switch" checked={prefs.sounds} onChange={(e) => setPrefs({ sounds: e.target.checked })} />
          </label>
          <label>
            Sound volume <span className="muted tiny">{Math.round(prefs.soundVolume * 100)}%</span>
            <input type="range" min="0" max="1" step="0.05" value={prefs.soundVolume} disabled={!prefs.sounds} onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) })} />
          </label>
          {accErr && <div className="error">{accErr}</div>}
        </div>
      ) : tab === 'privacy' ? (
        <div className="form account">
          <div className="section">Blocked people</div>
          {blocked.length === 0 && <div className="muted small">You have not blocked anyone.</div>}
          {blocked.map((b) => (
            <div className="row between item" key={b.id}>
              <span>{b.display_name || b.username} <span className="muted small">@{b.username}</span></span>
              <button className="ghost small" onClick={() => unblock(b.id)}>Unblock</button>
            </div>
          ))}
          <Suspense fallback={null}><TwoFactorPanel /></Suspense>
          <Suspense fallback={<div className="muted small">Loading…</div>}><EncryptionPanel me={profile} /></Suspense>
          <div className="section">Rules and privacy</div>
          <button className="ghost" onClick={() => setRules(true)}><Icon name="shield" size={15} /> Guidelines, terms and privacy</button>
        </div>
      ) : (
        <div className="form account about">
          <div className="about-head"><Mascot mood="happy" size={72} animated /><div><strong>Nook</strong><div className="muted small">Group chats and DMs. No servers, no fuss.</div></div></div>
          <div className="section">Help</div>
          <button className="ghost" onClick={() => setRules(true)}><Icon name="shield" size={15} /> Guidelines, terms and privacy</button>
          <div className="hint">Report a message from the flag button on it. Block someone from their profile.</div>
        </div>
      )}
        </div>
      </div>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </Modal>
  )
}

export function GroupModal({ onClose, onDone }) {
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function create(e) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('create_group', { group_name: name.trim() })
    if (error) return setError(error.message)
    onDone(data)
  }
  async function join(e) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('join_group', { code: code.trim() })
    if (error) return setError(error.message)
    onDone(data)
  }
  return (
    <Modal title="Group chats" onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'create' ? 'on' : ''} onClick={() => { setTab('create'); setError('') }}>Create</button>
        <button className={tab === 'join' ? 'on' : ''} onClick={() => { setTab('join'); setError('') }}>Join with code</button>
      </div>
      {tab === 'create' ? (
        <form className="form" onSubmit={create}>
          <label>Group name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus /></label>
          <div className="hint">You can add an icon afterwards in group settings, and set up channels right in the sidebar.</div>
          {error && <div className="error">{error}</div>}
          <button className="primary">Create group</button>
        </form>
      ) : (
        <form className="form" onSubmit={join}>
          <label>Invite code<input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary">Join group</button>
        </form>
      )}
    </Modal>
  )
}

const PERMS = [
  ['channels', 'Manage channels', 'Create, edit, delete and rearrange channels and categories'],
  ['messages', 'Manage messages', 'Delete anyone\'s messages, post in read-only channels, skip slowmode'],
  ['emoji', 'Manage emoji', 'Add and remove the group\'s custom emoji'],
  ['invites', 'Create invites', 'Make a new invite code'],
  ['members', 'Remove members', 'Remove people from the group'],
  ['customize', 'Customise the group', 'Change its name, icon, banner, description and colour'],
]
const SLOW = [[0, 'Off'], [5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes'], [900, '15 minutes'], [3600, '1 hour'], [21600, '6 hours']]

export function ChannelSettings({ channel, me, onClose, onSaved }) {
  const [f, setF] = useState({ name: channel.name, topic: channel.topic || '', icon: channel.icon || '', slowmode: channel.slowmode || 0, read_only: Boolean(channel.read_only) })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [iconUrl, setIconUrl] = useState(channel.icon_url || null)
  async function pickIcon(file) {
    setBusy(true); setErr('')
    try { setIconUrl(await uploadMedia(me.id, file, 'cicon')) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function save(e) {
    e.preventDefault()
    const name = f.name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30)
    if (!name) return setErr('Give the channel a name.')
    setBusy(true)
    const { error } = await supabase.from('channels').update({ name, topic: f.topic.trim().slice(0, 120), icon: [...f.icon.trim()].slice(0, 2).join('') || null, slowmode: Number(f.slowmode), read_only: f.read_only, icon_url: iconUrl }).eq('id', channel.id)
    setBusy(false)
    if (error) return setErr(/column|schema/i.test(error.message) ? 'Run update_v12.sql in Supabase to use channel settings.' : error.message)
    onSaved()
  }
  return (
    <Modal title={`Channel settings`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={30} /></label>
        <label>Topic<input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={120} placeholder="What is this channel for?" /></label>
        <div className="chan-icon-edit">
          <span className="chan-icon-prev">{iconUrl ? <img src={iconUrl} alt="" /> : f.icon ? <span>{f.icon}</span> : <Icon name="hash" size={20} />}</span>
          <div className="col">
            <strong>Picture</strong>
            <div className="row"><FilePick label={iconUrl ? 'Change picture' : 'Upload picture'} onFile={pickIcon} busy={busy} />{iconUrl && <button type="button" className="ghost small" onClick={() => setIconUrl(null)}>Remove</button>}</div>
          </div>
        </div>
        <label>Symbol instead<input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} maxLength={4} placeholder="One emoji or symbol (optional)" /></label>
        <label>Slowmode
          <select value={f.slowmode} onChange={(e) => setF({ ...f, slowmode: e.target.value })}>
            {SLOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="muted tiny">How long people wait between messages. Moderators are exempt.</span>
        </label>
        <label className="switch-row">
          <span>Read-only (announcements)<span className="muted tiny">Only people who can manage messages can post here.</span></span>
          <input type="checkbox" className="switch" checked={f.read_only} onChange={(e) => setF({ ...f, read_only: e.target.checked })} />
        </label>
        {err && <div className="error">{err}</div>}
        <div className="modal-foot"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}

function EmojiManager({ group, me }) {
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = async () => {
    const { data, error } = await supabase.from('group_emojis').select('id, name, url').eq('group_id', group.id).order('name')
    if (error) { setErr(/relation|schema|does not exist/i.test(error.message) ? 'Run update_v12.sql in Supabase to use custom emoji.' : error.message); setList([]) } else setList(data || [])
  }
  useEffect(() => { load() }, [group.id])
  async function add(file) {
    if (!file) return
    if (file.size > 256 * 1024) return setErr('Emoji pictures must be under 256 KB.')
    const guess = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
    const name = await promptDialog({ title: 'Name this emoji', body: 'Letters, numbers and underscores. People type it as :name:', value: guess, maxLength: 32, confirmLabel: 'Add' })
    if (name === null) return
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (clean.length < 2) return setErr('Names need at least 2 letters or numbers.')
    setBusy(true); setErr('')
    try {
      const url = await uploadMedia(me.id, file, 'emoji')
      const { error } = await supabase.from('group_emojis').insert({ group_id: group.id, name: clean, url, created_by: me.id })
      if (error) { removeMedia(url); throw new Error(/duplicate/i.test(error.message) ? 'This group already has an emoji with that name.' : error.message) }
      await load(); loadCustomEmoji(true)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  async function del(e) {
    if (!(await confirmDialog({ title: `Remove :${e.name}:?`, body: 'Messages that used it will show its name instead.', confirmLabel: 'Remove', danger: true }))) return
    const { error } = await supabase.from('group_emojis').delete().eq('id', e.id)
    if (error) return setErr(error.message)
    removeMedia(e.url); await load(); loadCustomEmoji(true)
  }
  return (
    <>
      <div className="section">Custom emoji</div>
      <div className="hint">Everyone in the group can use these, and so can they in their DMs. Up to 50, pictures under 256 KB.</div>
      {list?.length > 0 && (
        <div className="emoji-grid">
          {list.map((e) => (
            <div className="emoji-item" key={e.id}>
              <img src={e.url} alt={`:${e.name}:`} loading="lazy" />
              <span className="ellipsis">:{e.name}:</span>
              <button type="button" className="icon-btn danger" aria-label={`Remove ${e.name}`} onClick={() => del(e)}><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="row"><FilePick label="Add emoji" onFile={add} busy={busy} /></div>
      {err && <div className="error">{err}</div>}
    </>
  )
}

function PermEditor({ member, group, onDone }) {
  const [perms, setPerms] = useState(member.perms || [])
  const [busy, setBusy] = useState(false)
  const toggle = (k) => setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('set_member_perms', { gid: group.id, uid: member.user_id, new_perms: perms })
    setBusy(false)
    if (error) return toast(/function|schema/i.test(error.message) ? 'Run update_v12.sql in Supabase first.' : error.message, 'error')
    toast('Permissions saved.')
    onDone()
  }
  return (
    <div className="perm-editor">
      {PERMS.map(([k, label, hint]) => (
        <label className="switch-row" key={k}>
          <span>{label}<span className="muted tiny">{hint}</span></span>
          <input type="checkbox" className="switch" checked={perms.includes(k)} onChange={() => toggle(k)} />
        </label>
      ))}
      <div className="row"><button type="button" className="primary small" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save permissions'}</button></div>
    </div>
  )
}

export function GroupSettings({ group, categories, channels, members, me, isFounder, can = {}, onClose, onChanged, onLeft }) {
  const [openPerm, setOpenPerm] = useState(null)
  const [desc, setDesc] = useState(group.description || '')
  const [name, setName] = useState(group.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(group.invite_code)
  const wrap = async (p) => {
    const { error } = await p
    if (error) setError(error.message)
    else { setError(''); onChanged() }
  }

  async function pickIcon(file) {
    setBusy(true)
    try {
      const url = await uploadMedia(me.id, file, 'group')
      const old = group.icon_url
      await wrap(supabase.from('groups').update({ icon_url: url }).eq('id', group.id))
      if (old) removeMedia(old)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  async function removeIcon() {
    const old = group.icon_url
    await wrap(supabase.from('groups').update({ icon_url: null }).eq('id', group.id))
    if (old) removeMedia(old)
  }
  async function pickBanner(file) {
    setBusy(true)
    try {
      const url = await uploadMedia(me.id, file, 'gbanner')
      const old = group.banner_url
      await wrap(supabase.from('groups').update({ banner_url: url }).eq('id', group.id))
      if (old) removeMedia(old)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  async function removeBanner() {
    const old = group.banner_url
    await wrap(supabase.from('groups').update({ banner_url: null }).eq('id', group.id))
    if (old) removeMedia(old)
  }
  async function newInvite() {
    if (!(await confirmDialog({ title: 'Create a new invite code?', body: 'The old code will stop working.', confirmLabel: 'Create' }))) return
    const { data, error } = await supabase.rpc('regenerate_invite', { gid: group.id })
    if (error) return setError(error.message)
    setCode(data)
    onChanged()
  }
  async function leave() {
    if (isFounder && members.length > 1) return setError('Pass the founder role to someone else before leaving.')
    if (!(await confirmDialog({ title: 'Leave this group?', confirmLabel: 'Leave', danger: true }))) return
    await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', me.id)
    onLeft()
  }
  async function del() {
    if (!(await confirmDialog({ title: 'Delete this group?', body: 'All its channels and messages will be removed. This cannot be undone.', confirmLabel: 'Delete group', danger: true }))) return
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) setError(error.message)
    else onLeft()
  }

  return (
    <Modal title="Group settings" onClose={onClose}>
      <div className="form">
        <div className="row nowrap">
          <GroupIcon group={group} size={52} />
          <div className="col">
            <strong>{group.name}</strong>
            {isFounder && (
              <div className="row">
                <FilePick label="Upload icon" onFile={pickIcon} busy={busy} />
                {group.icon_url && <button type="button" className="ghost small" onClick={removeIcon}>Remove</button>}
              </div>
            )}
          </div>
        </div>

        {can.customize && (
          <div className="gbanner-edit">
            <div className="gbanner-prev" style={group.banner_url ? { backgroundImage: `url(${group.banner_url})` } : undefined}>{!group.banner_url && <span className="muted small">No banner</span>}</div>
            <div className="row">
              <FilePick label={group.banner_url ? 'Change banner' : 'Upload banner'} onFile={pickBanner} busy={busy} />
              {group.banner_url && <button type="button" className="ghost small" onClick={removeBanner}>Remove</button>}
            </div>
            <div className="hint">Shown at the top of the channel list. Wide images work best.</div>
          </div>
        )}
        {can.customize && (
          <>
            <label>Description
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} rows={2} placeholder="What is this group about?" onBlur={() => desc.trim() !== (group.description || '') && wrap(supabase.from('groups').update({ description: desc.trim() || null }).eq('id', group.id))} />
            </label>
            <ColorPicker label="Group colour" value={group.accent || ''} presets={ACCENTS} noneLabel="Default" onChange={(v) => wrap(supabase.from('groups').update({ accent: v || null }).eq('id', group.id))} />
          </>
        )}
        {can.emoji && <EmojiManager group={group} me={me} />}

        <label>Invite code
          <div className="row nowrap">
            <input readOnly value={code} onFocus={(e) => e.target.select()} />
            <button type="button" className="ghost" onClick={() => navigator.clipboard?.writeText(code)}><Icon name="copy" size={15} /> Copy</button>
            {can.invites && <button type="button" className="icon-btn" title="New invite code" onClick={newInvite}><Icon name="refresh" size={15} /></button>}
          </div>
        </label>

        {can.customize && (
          <label>Group name
            <div className="row nowrap">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              <button type="button" className="ghost" onClick={() => wrap(supabase.from('groups').update({ name: name.trim() }).eq('id', group.id))}>Rename</button>
            </div>
          </label>
        )}

        {(isFounder || can.members) && (
          <>
            <div className="section">Members</div>
            {members.filter((m) => m.user_id !== me.id).map((m) => (
              <div key={m.user_id}>
                <div className="row between item">
                  <span className="row tight"><Avatar profile={m.profile} size={24} /><Name profile={m.profile} />{m.role === 'founder' ? <span className="muted tiny">Founder</span> : m.perms?.length > 0 && <span className="perm-count">{m.perms.length} {m.perms.length === 1 ? 'permission' : 'permissions'}</span>}</span>
                  <span className="row tight">
                    {isFounder && m.role !== 'founder' && <button type="button" className="ghost small" onClick={() => setOpenPerm(openPerm === m.user_id ? null : m.user_id)} aria-expanded={openPerm === m.user_id}><Icon name="key" size={13} /> Permissions</button>}
                    {isFounder && <button type="button" className="ghost small" onClick={async () => (await confirmDialog({ title: 'Make them the founder?', body: 'You will become a regular member.', confirmLabel: 'Make founder' })) && wrap(supabase.rpc('transfer_founder', { gid: group.id, new_founder: m.user_id }))}>Make founder</button>}
                    {m.role !== 'founder' && <button type="button" className="icon-btn danger" title="Remove member" onClick={async () => (await confirmDialog({ title: 'Remove this member?', confirmLabel: 'Remove', danger: true })) && wrap(supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', m.user_id))}><Icon name="x" size={15} /></button>}
                  </span>
                </div>
                {openPerm === m.user_id && <PermEditor member={m} group={group} onDone={() => { setOpenPerm(null); onChanged() }} />}
              </div>
            ))}
          </>
        )}

        {error && <div className="error">{error}</div>}
        <div className="row">
          <button type="button" className="ghost danger" onClick={leave}>Leave group</button>
          {isFounder && <button type="button" className="ghost danger" onClick={del}>Delete group</button>}
        </div>
      </div>
    </Modal>
  )
}
