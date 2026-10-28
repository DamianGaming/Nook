import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { BadgeRow } from '../badges.jsx'
import { Name, themeColors } from '../cosmetics.jsx'
import { replaceShortcodes, loadEmoji } from '../emoji.js'
import { linksOf, hostLabel } from '../socials.js'
import { desktop } from '../desktop.js'
import { STATUSES, CLEAR_AFTER, expiryFor, ACTIVITIES, activityList, manualActivity, sinceLabel } from '../status.js'
import { confirmDialog, reportDialog, notify } from '../dialog.jsx'

const since = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/* The speech bubble next to the avatar: a person's custom status. Yours is clickable and invites you to set one. */
function Bubble({ profile, onSet }) {
  if (profile.status_text) {
    return (
      <div className="bubble" title={profile.status_text}>
        <span>{profile.status_text}</span>
      </div>
    )
  }
  if (!onSet) return null
  return <button className="bubble empty" onClick={onSet}><Icon name="plus" size={14} /> <span>What are you up to?</span></button>
}

/* Everything someone is doing, as small cards: the program's own icon (when known), what it is, and for how long.
   Two or more sit in a tidy stack; all of them keep the same size and spacing. */
function ActivityCard({ a, multi }) {
  const src = a.img ? supabase.storage.from('media').getPublicUrl(a.img).data.publicUrl : null
  return (
    <div className={`activity-card ${a.auto ? 'live' : ''} ${multi ? 'multi' : ''}`}>
      <span className={`ac-ico ${src ? 'has-img' : ''}`}>
        {src ? <img src={src} alt="" width="32" height="32" decoding="async" draggable="false" /> : <Icon name={a.icon} size={16} />}
      </span>
      <span className="ac-text">
        <span className="ac-verb">{a.verb}</span>
        <strong className="ellipsis" title={a.name}>{a.name}</strong>
      </span>
      {a.at ? <span className="ac-time" title="How long">{sinceLabel(a.at)}</span> : null}
    </div>
  )
}
export function ActivityLine({ profile, className = '' }) {
  const list = activityList(profile)
  const [, tick] = useState(0)
  const hasTime = list.some((a) => a.at)
  // The elapsed times keep counting while the card is open.
  useEffect(() => {
    if (!hasTime) return undefined
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [hasTime])
  if (!list.length) return null
  return (
    <div className={`activity-stack ${className}`} role="list" aria-label="Activity">
      {list.map((a) => <div role="listitem" key={`${a.id}:${a.name}`}><ActivityCard a={a} multi={list.length > 1} /></div>)}
    </div>
  )
}

function Banner({ profile }) {
  return (
    <div className="pf-banner" style={{ background: profile.banner_color }}>
      {profile.banner_url && <img src={profile.banner_url} alt="" draggable="false" />}
    </div>
  )
}

/* The one profile card. The profile popup, your own menu and the editor preview all draw it, so they always match. */
export function CardBody({ profile, founder, role, onSet, size = 84, flat, bare, compact, label, onClose, footer, children }) {
  const links = linksOf(profile)
  const theme = themeColors(profile.card_theme)
  const roleLabel = role === 'founder' || founder ? 'Founder' : null
  return (
    <div
      className={`pfull ${flat ? "flat" : ""} ${bare ? "bare" : ""} ${compact ? "compact-card" : ""}`}
      data-theme={theme ? profile.card_theme : undefined}
      role={label ? 'dialog' : undefined}
      aria-modal={label ? 'true' : undefined}
      aria-label={label}
      style={{ '--pc': profile.accent_color, '--pb': theme ? theme[0] : profile.banner_color, '--pb2': theme ? theme[1] : undefined }}
    >
      {onClose && <button className="icon-btn pf-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>}
      <Banner profile={profile} />
      <div className="pf-top">
        <span className="pf-avatar"><Avatar profile={profile} size={size} status /></span>
        <Bubble profile={profile} onSet={onSet} />
      </div>
      <div className="pf-name">
        <Name profile={profile} as="strong" className="pf-display" />
        <span className="muted small">@{profile.username}{profile.pronouns && <> <i className="dot" /> {profile.pronouns}</>}</span>
        <BadgeRow profile={profile} founder={founder || role === 'founder'} labels={!compact} size={compact ? 20 : 22} />
      </div>
      <ActivityLine profile={profile} />
      {compact ? (
        links.length > 0 && (
          <div className="link-chips umenu-links">
            {links.map((l) => (
              <a key={l.url} className="link-chip" href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={l.url}><Icon name="link" size={13} /><span className="ellipsis">{hostLabel(l.url)}</span></a>
            ))}
          </div>
        )
      ) : (
      <div className="pf-panel">
        {profile.bio && (<div className="pf-sec"><h3>About me</h3><p>{profile.bio}</p></div>)}
        {links.length > 0 && (
          <div className="pf-sec">
            <h3>Links</h3>
            <div className="link-chips">
              {links.map((l) => (
                <a key={l.url} className="link-chip" href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={l.url}>
                  <Icon name="link" size={13} /><span className="ellipsis">{hostLabel(l.url)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="pf-sec pf-two">
          <div><h3>Nook member since</h3><p>{profile.created_at ? since(profile.created_at) : 'Today'}</p></div>
          {roleLabel && <div><h3>In this group</h3><p>{roleLabel}</p></div>}
        </div>
        {children}
      </div>
      )}
      {footer}
    </div>
  )
}

/* Full profile, opened by clicking a name or avatar. */
export function ProfileCard({ profile, me, role, onClose, onMessage, onBlocked, onEdit }) {
  const links = linksOf(profile)
  const isMe = profile.id === me.id
  const noteKey = `nook-note-${profile.id}`
  const [note, setNote] = useState(() => { try { return localStorage.getItem(noteKey) || '' } catch { return '' } })
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  async function reportUser() {
    const r = await reportDialog({ title: `Report @${profile.username}`, body: 'Tell us what is wrong with this account. We never tell them who reported them.' })
    if (!r) return
    const row = { reporter: me.id, reported_user: profile.id, reason: (r.reason || r.category).slice(0, 500), message_snapshot: `[profile] @${profile.username}`, category: r.category }
    let { error } = await supabase.from('reports').insert(row)
    if (error && /category/i.test(error.message)) ({ error } = await supabase.from('reports').insert({ ...row, category: undefined }))
    notify(error ? error.message : 'Thanks, your report was sent.', error ? 'error' : 'info')
  }
  async function block() {
    if (!(await confirmDialog({ title: `Block @${profile.username}?`, body: "They won't be able to DM you. You can unblock them in Settings.", confirmLabel: 'Block', danger: true }))) return
    const { error } = await supabase.from('blocks').insert({ blocker: me.id, blocked: profile.id })
    notify(error ? error.message : 'Blocked.', error ? 'error' : 'info')
    onBlocked?.()
    onClose()
  }
  const [rel, setRel] = useState(null) // null (loading) | { status, mine, id }
  useEffect(() => {
    if (isMe) return
    let live = true
    supabase.from('friendships').select('*').or(`and(requester.eq.${me.id},addressee.eq.${profile.id}),and(requester.eq.${profile.id},addressee.eq.${me.id})`).maybeSingle()
      .then(({ data }) => { if (live) setRel(data ? { id: data.id, status: data.status, mine: data.requester === me.id } : { status: 'none' }) })
    return () => { live = false }
  }, [isMe, me.id, profile.id])
  async function addFriend() {
    const { data, error } = await supabase.rpc('send_friend_request', { uname: profile.username })
    if (error) return notify(error.message, 'error')
    setRel({ status: data === 'accepted' || data === 'already' ? 'accepted' : 'pending', mine: data === 'sent' || data === 'pending' })
    notify(data === 'accepted' ? `You and ${profile.display_name || profile.username} are now friends.` : 'Friend request sent.')
  }
  const saveNote = () => { try { note ? localStorage.setItem(noteKey, note) : localStorage.removeItem(noteKey) } catch { /* private mode */ } }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <CardBody profile={profile} role={role} label={`${profile.display_name || profile.username}'s profile`} onClose={onClose} footer={
        <div className="pf-actions">
          {isMe ? (
            <button className="primary" onClick={() => { onClose(); onEdit?.() }}><Icon name="pencil" size={15} /> Edit profile</button>
          ) : (
            <>
              <button className="primary" onClick={() => { onMessage(profile.id); onClose() }}><Icon name="message" size={15} /> Message</button>
              {rel && rel.status === 'none' && <button className="ghost" onClick={addFriend}><Icon name="plus" size={15} /> Add friend</button>}
              {rel && rel.status === 'pending' && <span className="muted small pill-note">{rel.mine ? 'Request sent' : 'Wants to be friends'}</span>}
              {rel && rel.status === 'accepted' && <span className="muted small pill-note"><Icon name="check" size={13} /> Friends</span>}
              <button className="ghost icon-only" onClick={reportUser} title="Report" aria-label="Report"><Icon name="flag" size={15} /></button>
              <button className="ghost danger icon-only" onClick={block} title="Block" aria-label="Block"><Icon name="ban" size={15} /></button>
            </>
          )}
        </div>
      }>
        {!isMe && (
          <div className="pf-sec">
            <h3>Note <span className="muted tiny">only you see this</span></h3>
            <textarea className="pf-note" rows={2} maxLength={200} placeholder="Click to add a note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
          </div>
        )}
      </CardBody>
    </div>
  )
}

/* Your own menu above your name: status, custom status, edit profile, copy ID. */
export function UserMenu({ profile, onClose, onEdit, onVoice, onSignOut, onHome, reload }) {
  const [view, setView] = useState('main') // main | status | custom | activity
  const [actType, setActType] = useState(profile.activity_type || 'playing')
  const [actName, setActName] = useState(profile.activity_name || '')
  const [text, setText] = useState(profile.status_text || '')
  const [clear, setClear] = useState('never')
  const ref = useRef(null)

  useEffect(() => { loadEmoji() }, [])
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', k) }
  }, [onClose])

  async function save(patch, done = true) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    if (error) return notify(error.message, 'error')
    await reload()
    if (done) setView('main')
  }
  const cur = STATUSES.find((s) => s.id === profile.status) || STATUSES[0]

  return (
    <div className="umenu" ref={ref} role="menu" style={{ '--pc': profile.accent_color }}>
      {view === 'main' && (
        <>
          <CardBody profile={profile} onSet={() => setView('custom')} size={64} flat bare compact />
          <div className="umenu-list">
            <button className="umenu-row" onClick={() => { onClose(); onEdit() }}><Icon name="pencil" size={16} /> Edit profile</button>
            <button className="umenu-row" onClick={() => setView('status')}>
              <span className="sdot" style={{ background: cur.color }} /> {cur.label}<Icon name="chevron" size={14} className="to-right" />
            </button>
            <button className="umenu-row" onClick={() => setView('custom')}><Icon name="smile" size={16} /> {profile.status_text ? 'Change custom status' : 'Set a custom status'}</button>
            <button className="umenu-row" onClick={() => setView('activity')}><Icon name="play" size={16} /> {manualActivity(profile) ? 'Change activity' : 'Set an activity'}</button>
            <button className="umenu-row" role="switch" aria-checked={profile.activity_auto !== false} onClick={() => save({ activity_auto: profile.activity_auto === false, ...(profile.activity_auto !== false ? { activities: [], activity_seen: null } : {}) }, false)}>
              <Icon name="sparkle" size={16} /> <span className="grow">{desktop ? "Show games and what I'm doing" : "Show what I'm doing"}</span><span className={`switch ${profile.activity_auto !== false ? 'on' : ''}`} aria-hidden="true" />
            </button>
            <div className="umenu-sep" />
            {onHome && !desktop && <button className="umenu-row" onClick={() => { onClose(); onHome() }}><Icon name="leaf" size={16} /> Nook home page</button>}
            <button className="umenu-row" onClick={() => { onClose(); onVoice() }}><Icon name="headphones" size={16} /> Voice and video settings</button>
            <button className="umenu-row" onClick={async () => { try { await navigator.clipboard.writeText(profile.id); notify('User ID copied.') } catch { notify('Could not copy.', 'error') } onClose() }}><Icon name="copy" size={16} /> Copy user ID</button>
            <button className="umenu-row danger" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
          </div>
        </>
      )}

      {view === 'status' && (
        <div className="umenu-list">
          <button className="umenu-back" onClick={() => setView('main')}><Icon name="chevron" size={14} className="to-left" /> Status</button>
          {STATUSES.map((s) => (
            <button key={s.id} className="umenu-row two" onClick={() => save({ status: s.id })}>
              <span className="sdot" style={{ background: s.color }} />
              <span className="grow"><strong>{s.label}</strong><span className="muted tiny">{s.desc}</span></span>
              {profile.status === s.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}

      {view === 'activity' && (
        <div className="umenu-custom">
          <button className="umenu-back" onClick={() => setView('main')}><Icon name="chevron" size={14} className="to-left" /> Activity</button>
          <div className="act-types" role="radiogroup" aria-label="Activity type">
            {ACTIVITIES.filter((a) => !a.auto).map((a) => <button type="button" key={a.id} role="radio" aria-checked={actType === a.id} className={`choice small ${actType === a.id ? 'on' : ''}`} onClick={() => setActType(a.id)}><Icon name={a.icon} size={13} /> {a.verb}</button>)}
          </div>
          <input value={actName} maxLength={60} autoFocus placeholder={`Name of ${ACTIVITIES.find((a) => a.id === actType)?.hint}`} onChange={(e) => setActName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && actName.trim() && save({ activity_type: actType, activity_name: actName.trim(), activity_at: new Date().toISOString(), activity_src: null, activity_icon: null, activity_seen: null })} />
          <p className="muted tiny">Shown on your profile and next to your name. It clears itself after a day.</p>
          <div className="row">
            {manualActivity(profile) && <button className="ghost" onClick={() => save({ activity_type: null, activity_name: null, activity_at: null, activity_src: null, activity_icon: null, activity_seen: null })}>Clear</button>}
            <button className="primary grow-btn" disabled={!actName.trim()} onClick={() => save({ activity_type: actType, activity_name: actName.trim(), activity_at: new Date().toISOString(), activity_src: null, activity_icon: null, activity_seen: null })}>Save</button>
          </div>
        </div>
      )}

      {view === 'custom' && (
        <div className="umenu-custom">
          <button className="umenu-back" onClick={() => setView('main')}><Icon name="chevron" size={14} className="to-left" /> Custom status</button>
          <input value={text} maxLength={60} autoFocus placeholder="What are you up to? Emojis welcome" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save({ status_text: replaceShortcodes(text.trim()), status_icon: '', status_expires_at: text.trim() ? expiryFor(clear) : null })} />
          <label>Clear after
            <select value={clear} onChange={(e) => setClear(e.target.value)}>{CLEAR_AFTER.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </label>
          <div className="row">
            {profile.status_text && <button className="ghost" onClick={() => save({ status_text: '', status_icon: '', status_expires_at: null })}>Clear</button>}
            <button className="primary grow-btn" onClick={() => save({ status_text: replaceShortcodes(text.trim()), status_icon: '', status_expires_at: text.trim() ? expiryFor(clear) : null })}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
