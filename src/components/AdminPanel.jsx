import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { confirmDialog, promptDialog, notify } from '../dialog.jsx'
import { Modal } from './Modals.jsx'
import { BADGES } from '../badges.jsx'
import Icon from './Icon.jsx'

// Staff only. The buttons here call database functions that check the staff badge again on the server,
// so hiding or showing this panel in the browser is only for convenience.
const GIVEN = ['team', 'mod', 'partner', 'champion', 'creator', 'supporter', 'bughunter', 'tester', 'translator', 'early']
const CATS = { harassment: 'Harassment', hate: 'Hate', sexual: 'Sexual content', minor: 'Child safety', threat: 'Threats', spam: 'Spam', illegal: 'Illegal', impersonation: 'Impersonation', other: 'Other' }
const ago = (iso) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const fail = (error) => notify(/function|schema cache/i.test(error.message) ? 'Run the newest SQL files in Supabase first (update_v31.sql to update_v33.sql for the staff tools).' : error.message, 'error')

function exportCsv(rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['when', 'category', 'reporter', 'reported', 'reason', 'message', 'resolved', 'note']
  const body = rows.map((r) => [r.created_at, r.category, r.reporter_name, r.reported_name, r.reason, r.snapshot, r.resolved, r.note].map(cell).join(','))
  const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = `nook-reports-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function Bars({ data, labels, title, unit }) {
  const max = Math.max(1, ...data)
  return (
    <div className="adm-chart" role="img" aria-label={`${title}: ${data.join(', ')}`}>
      <div className="adm-chart-head"><strong>{title}</strong><span className="muted tiny">{data.reduce((a, b) => a + b, 0)} {unit}</span></div>
      <div className="adm-bars">{data.map((n, i) => <i key={i} style={{ height: `${Math.max(6, (n / max) * 100)}%` }} title={`${n} ${unit}`}><b>{n}</b><em>{labels?.[i]}</em></i>)}</div>
    </div>
  )
}

function Overview({ go }) {
  const [s, setS] = useState(null)
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_stats2').then(({ data, error }) => (error ? fail(error) : setS(data)))
    supabase.from('site_settings').select('key, value').then(({ data }) => setCfg(Object.fromEntries((data || []).map((r) => [r.key, r.value]))))
  }, [])
  const n = (k) => (s ? Number(s[k]).toLocaleString() : '–')
  const cards = [
    ['users', 'People', n('users'), `${n('new_7d')} new this week`, 'users'],
    ['active', 'Active today', n('active_24h'), 'people who posted', 'message'],
    ['msgs', 'Messages today', n('messages_24h'), `${n('messages_total')} in total`, 'send'],
    ['groups', 'Groups', n('groups'), 'chats with channels', 'grid'],
    ['bots', 'Bots', n('bots'), `${n('bots_online')} online now`, 'sparkle'],
    ['reports', 'Open reports', n('open_reports'), `${n('reports_7d')} this week`, 'flag'],
  ]
  return (
    <>
      {(cfg?.read_only === true || cfg?.signups_open === false) && (
        <div className="adm-alert" role="status">
          <Icon name="alert" size={16} />
          <span>{cfg.read_only === true && 'Read-only mode is on. '}{cfg.signups_open === false && 'Sign-ups are paused. '}</span>
          <button className="ghost small" onClick={() => go('settings')}>Change</button>
        </div>
      )}
      <div className="adm-stats">
        {cards.map(([k, label, big, sub, icon]) => (
          <div className={`adm-stat ${k === 'reports' && s && Number(s.open_reports) > 0 ? 'hot' : ''}`} key={k}>
            <span className="adm-stat-ico"><Icon name={icon} size={16} /></span>
            <strong>{big}</strong><span className="adm-stat-label">{label}</span><small>{sub}</small>
          </div>
        ))}
      </div>
      {s && (
        <div className="adm-charts">
          <Bars data={s.signups_7d} labels={s.days} title="New people" unit="joined" />
          <Bars data={s.messages_7d} labels={s.days} title="Messages" unit="sent" />
        </div>
      )}
      {s && Number(s.banned) > 0 && <p className="muted tiny">{s.banned} {Number(s.banned) === 1 ? 'account is' : 'accounts are'} suspended.</p>}
    </>
  )
}

function GroupMembers({ gid, onChanged }) {
  const [rows, setRows] = useState(null)
  const load = useCallback(() => supabase.rpc('admin_group_members', { gid }).then(({ data, error }) => (error ? (fail(error), setRows([])) : setRows(data || []))), [gid])
  useEffect(() => { load() }, [load])
  async function remove(m) {
    const why = await promptDialog({ title: `Remove @${m.username}?`, body: 'They are taken out of this group. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Remove' })
    if (!why) return
    const { error } = await supabase.rpc('admin_remove_member', { gid, uid: m.user_id, why })
    error ? fail(error) : (notify('Removed.'), load(), onChanged?.())
  }
  if (!rows) return <div className="adm-detail muted tiny">Loading…</div>
  return (
    <ul className="adm-members">
      {rows.map((m) => (
        <li key={m.user_id}>
          <span className="ellipsis"><strong>{m.display_name || m.username}</strong> <span className="muted tiny">@{m.username}</span></span>
          {m.is_bot && <span className="bot-pill"><Icon name="bot" size={11} /> BOT</span>}
          {m.role === 'founder' ? <span className="adm-cat">Founder</span> : <button className="icon-btn danger" title="Remove from group" aria-label={`Remove ${m.username}`} onClick={() => remove(m)}><Icon name="x" size={14} /></button>}
        </li>
      ))}
    </ul>
  )
}

function Groups() {
  const [open, setOpen] = useState(null)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const load = useCallback(async (text) => {
    const { data, error } = await supabase.rpc('admin_find_groups', { q: text.trim() })
    error ? (fail(error), setRows([])) : setRows(data || [])
  }, [])
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t) }, [q, load])
  async function del(g) {
    const why = await promptDialog({ title: `Delete "${g.name}"?`, body: 'All its channels and messages are removed for good. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Delete group' })
    if (!why) return
    const { error } = await supabase.rpc('admin_delete_group', { gid: g.id, why })
    error ? fail(error) : (notify('Group deleted.'), load(q))
  }
  async function freeze(g, on) {
    let why = null
    if (on) { why = await promptDialog({ title: `Freeze "${g.name}"?`, body: 'Nobody but staff can post until you unfreeze it. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Freeze' }); if (!why) return }
    const { error } = await supabase.rpc('admin_set_group_frozen', { gid: g.id, on_: on, why })
    error ? fail(error) : (notify(on ? 'Group frozen.' : 'Group unfrozen.'), load(q))
  }
  return (
    <>
      <div className="adm-bar"><div className="adm-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups by name or ID" aria-label="Search groups" /></div></div>
      {rows?.length === 0 && <div className="muted small adm-empty">No groups found.</div>}
      {rows?.map((g) => (
        <article className="adm-card split" key={g.id}>
          <div className="adm-main">
            <header><strong>{g.name}</strong><span className="adm-cat">{g.members} {g.members === 1 ? 'member' : 'members'}</span><span className="muted tiny">{g.channels} channels{Number(g.bots) > 0 ? `, ${g.bots} ${Number(g.bots) === 1 ? 'bot' : 'bots'}` : ''}</span>{g.frozen_at && <span className="adm-warn">Frozen</span>}</header>
            <p className="muted tiny">@{g.founder || 'unknown'} · {new Date(g.created_at).toLocaleDateString()} · <button className="inline-link" onClick={() => navigator.clipboard?.writeText(g.id).then(() => notify('Group ID copied.'))}>copy ID</button></p>
          </div>
          <footer>
            <button className="ghost small" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}><Icon name="users" size={13} /> Members</button>
            {g.frozen_at ? <button className="ghost small" onClick={() => freeze(g, false)}>Unfreeze</button> : <button className="ghost small" onClick={() => freeze(g, true)}><Icon name="lock" size={13} /> Freeze</button>}
            <button className="icon-btn danger" title="Delete group" aria-label="Delete group" onClick={() => del(g)}><Icon name="trash" size={14} /></button>
          </footer>
          {open === g.id && <GroupMembers gid={g.id} onChanged={() => load(q)} />}
        </article>
      ))}
    </>
  )
}

function Toggle({ on, onChange, title, body, danger }) {
  return (
    <div className="adm-row">
      <div><strong>{title}</strong><p className="muted small">{body}</p></div>
      <button type="button" role="switch" aria-checked={on} aria-label={title} className={'adm-switch' + (on ? ' on' : '') + (danger && on ? ' danger' : '')} onClick={() => onChange(!on)}><i /></button>
    </div>
  )
}

function Settings() {
  const [cfg, setCfg] = useState(null)
  const [text, setText] = useState('')
  const [level, setLevel] = useState('info')
  const load = () => supabase.from('site_settings').select('key, value').then(({ data, error }) => (error ? fail(error) : setCfg(Object.fromEntries((data || []).map((r) => [r.key, r.value])))))
  useEffect(() => {
    load()
    supabase.from('site_notice').select('body, level').eq('id', 1).maybeSingle().then(({ data }) => { if (data) { setText(data.body || ''); setLevel(data.level) } })
  }, [])
  async function set(k, v, ask) {
    if (ask && !(await confirmDialog({ title: ask.title, body: ask.body, confirmLabel: ask.ok, danger: true }))) return
    const { error } = await supabase.rpc('admin_set_setting', { k, v })
    error ? fail(error) : (notify('Saved.'), setCfg((c) => ({ ...c, [k]: v })))
  }
  async function save(clear) {
    const { error } = await supabase.rpc('admin_set_notice', { text_in: clear ? '' : text, lvl: level })
    error ? fail(error) : (notify(clear ? 'Announcement removed.' : 'Announcement published.'), clear && setText(''))
  }
  if (!cfg) return <div className="muted small adm-empty">Loading…</div>
  return (
    <>
      <section className="adm-card">
        <h3>Access</h3>
        <Toggle title="Allow new sign-ups" body="Turn off to pause new accounts (for example during a raid). People who already have an account are not affected." on={cfg.signups_open !== false}
          onChange={(v) => set('signups_open', v, v ? null : { title: 'Pause sign-ups?', body: 'Nobody new can create an account until you turn this back on.', ok: 'Pause sign-ups' })} />
        <Toggle title="Read-only mode" body="Only staff can post. Use it during maintenance. Everyone can still read and call." on={cfg.read_only === true} danger
          onChange={(v) => set('read_only', v, v ? { title: 'Turn on read-only mode?', body: 'Nobody except staff can send messages until you turn it off.', ok: 'Turn on' } : null)} />
      </section>
      <section className="adm-card">
        <h3>Announcement</h3>
        <p className="muted small">A banner shown to everyone at the top of Nook. People can dismiss it. Leave it empty for none.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} placeholder="Planned maintenance tonight at 10pm" aria-label="Announcement text" />
        <div className="adm-chips">{[['info', 'Info'], ['warn', 'Warning']].map(([id, l]) => <button key={id} type="button" className={`choice small ${level === id ? 'on' : ''}`} onClick={() => setLevel(id)}>{l}</button>)}</div>
        <footer><button className="primary small" onClick={() => save(false)} disabled={!text.trim()}>Publish</button><button className="ghost small" onClick={() => save(true)}>Remove</button></footer>
      </section>
      <section className="adm-card">
        <h3>Good to know</h3>
        <p className="muted small">The Staff badge can only be given from the SQL editor. Staff tools need a two-factor sign-in. Every change on this panel is written to the log.</p>
      </section>
    </>
  )
}

function Reports({ onBadge }) {
  const [open, setOpen] = useState(true)
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_reports', { only_open: open, lim: 100 })
    if (error) { fail(error); return setRows([]) }
    setRows(data || [])
  }, [open])
  useEffect(() => { setRows(null); load() }, [load])

  async function resolve(r, done) {
    let note = null
    if (done) { note = await promptDialog({ title: 'Resolve this report', body: 'Optional note for the log (what you did).', value: '', maxLength: 300, confirmLabel: 'Resolve' }); if (note === null) return }
    const { error } = await supabase.rpc('admin_resolve_report', { rid: r.id, done, note_text: note || null })
    error ? fail(error) : (notify(done ? 'Resolved.' : 'Reopened.'), load(), onBadge())
  }
  async function del(r) {
    if (!(await confirmDialog({ title: 'Delete this message?', body: 'It is removed for everyone and cannot come back.', confirmLabel: 'Delete', danger: true }))) return
    const { error } = await supabase.rpc('admin_delete_message', { mid: r.message_id, why: `report ${r.id}` })
    error ? fail(error) : (notify('Message deleted.'), load())
  }
  async function suspend(r) {
    const why = await promptDialog({ title: `Suspend ${r.reported_name || 'this person'}?`, body: 'They can still sign in but cannot send messages. Add a reason.', value: '', maxLength: 300, confirmLabel: 'Suspend' })
    if (!why) return
    const { error } = await supabase.rpc('admin_set_ban', { uid: r.reported_id, ban: true, why })
    error ? fail(error) : (notify('Suspended.'), load())
  }

  return (
    <>
      <div className="adm-bar">
        <div className="seg" role="tablist"><button className={open ? 'on' : ''} onClick={() => setOpen(true)}>Open</button><button className={!open ? 'on' : ''} onClick={() => setOpen(false)}>All</button></div>
        <span className="row tight">
          <button className="ghost small" disabled={!rows?.length} onClick={() => exportCsv(rows)}><Icon name="download" size={13} /> Export</button>
          <button className="icon-btn" title="Refresh" aria-label="Refresh" onClick={load}><Icon name="refresh" size={15} /></button>
        </span>
      </div>
      {rows === null && <div className="muted small adm-empty">Loading…</div>}
      {rows?.length === 0 && <div className="muted small adm-empty">{open ? 'No open reports. Nice and quiet.' : 'No reports yet.'}</div>}
      {rows?.map((r) => (
        <article className={`adm-card ${r.resolved ? 'done' : ''}`} key={r.id}>
          <header>
            <span className="adm-cat">{CATS[r.category] || 'Report'}</span>
            <span className="adm-who"><strong>{r.reporter_name || 'Someone'}</strong> <span className="muted">reported</span> <strong>{r.reported_name || 'a person'}</strong></span>
            <span className="muted tiny adm-time">{ago(r.created_at)}</span>
            {r.resolved && <span className="adm-ok"><Icon name="check" size={12} /> Resolved</span>}
            {r.reported_banned && <span className="adm-warn">Suspended</span>}
          </header>
          {r.snapshot && <blockquote>{r.snapshot}</blockquote>}
          {r.reason && r.reason !== r.snapshot && <p className="muted small">“{r.reason}”</p>}
          {r.note && <p className="muted tiny">Note: {r.note}</p>}
          <footer>
            {!r.resolved ? <button className="primary small" onClick={() => resolve(r, true)}><Icon name="check" size={13} /> Resolve</button> : <button className="ghost small" onClick={() => resolve(r, false)}>Reopen</button>}
            {r.message_id && <button className="ghost small danger" onClick={() => del(r)} title="Delete the reported message"><Icon name="trash" size={13} /> Delete</button>}
            {r.reported_id && !r.reported_banned && <button className="ghost small danger" onClick={() => suspend(r)}><Icon name="ban" size={13} /> Suspend</button>}
          </footer>
        </article>
      ))}
    </>
  )
}

function BadgeEditor({ u, onDone }) {
  const [sel, setSel] = useState((u.badges || []).filter((b) => GIVEN.includes(b)))
  const toggle = (b) => setSel((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b]))
  async function save() {
    const { error } = await supabase.rpc('admin_set_badges', { uid: u.id, new_badges: sel })
    error ? fail(error) : (notify('Badges saved.'), onDone())
  }
  return (
    <div className="adm-badges">
      <div className="adm-chips">{GIVEN.map((b) => <button type="button" key={b} className={`choice small ${sel.includes(b) ? 'on' : ''}`} onClick={() => toggle(b)} aria-pressed={sel.includes(b)}>{BADGES[b].label}</button>)}</div>
      <div className="row"><button className="primary small" onClick={save}>Save badges</button><span className="muted tiny">The Staff badge can only be changed in the SQL editor.</span></div>
    </div>
  )
}

function Detail({ id }) {
  const [d, setD] = useState(null)
  useEffect(() => { supabase.rpc('admin_user_detail', { uid: id }).then(({ data, error }) => (error ? fail(error) : setD(data))) }, [id])
  if (!d) return <div className="adm-detail muted tiny">Loading…</div>
  const items = [['Groups', d.groups], ['Messages', d.messages], ['This week', d.messages_7d], ['Bots owned', d.bots], ['Reports against', d.reports_against], ['Reports made', d.reports_made]]
  return (
    <div className="adm-detail">
      {items.map(([l, v]) => <div key={l}><strong>{Number(v).toLocaleString()}</strong><span>{l}</span></div>)}
      <p className="muted tiny">{d.last_message ? `Last message ${ago(d.last_message)}` : 'Has not posted yet'}</p>
    </div>
  )
}

function Users() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [open, setOpen] = useState(null)
  const search = useCallback(async (text) => {
    if (text.trim().length < 2) return setRows(null)
    const { data, error } = await supabase.rpc('admin_find_users', { q: text.trim() })
    error ? fail(error) : setRows(data || [])
  }, [])
  useEffect(() => { const t = setTimeout(() => search(q), 250); return () => clearTimeout(t) }, [q, search])

  async function ban(u, on) {
    let why = null
    if (on) { why = await promptDialog({ title: `Suspend @${u.username}?`, body: 'They can still sign in but cannot send messages. Add a reason.', value: '', maxLength: 300, confirmLabel: 'Suspend' }); if (!why) return }
    else if (!(await confirmDialog({ title: `Lift the suspension for @${u.username}?`, confirmLabel: 'Lift' }))) return
    const { error } = await supabase.rpc('admin_set_ban', { uid: u.id, ban: on, why })
    error ? fail(error) : (notify(on ? 'Suspended.' : 'Suspension lifted.'), search(q))
  }

  async function mute(u, minutes) {
    let why = null
    if (minutes) { why = await promptDialog({ title: `Time out @${u.username} for ${minutes >= 1440 ? `${minutes / 1440} day${minutes >= 2880 ? 's' : ''}` : minutes >= 60 ? `${minutes / 60} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`}?`, body: 'They can read but not post. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Time out' }); if (!why) return }
    const { error } = await supabase.rpc('admin_set_mute', { uid: u.id, minutes, why })
    error ? fail(error) : (notify(minutes ? 'Timed out.' : 'Time-out lifted.'), search(q))
  }
  return (
    <>
      <div className="adm-bar"><div className="adm-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username, name or user ID" aria-label="Search people" autoFocus /></div></div>
      {rows === null && <div className="muted small adm-empty">Type at least two letters.</div>}
      {rows?.length === 0 && <div className="muted small adm-empty">Nobody found.</div>}
      {rows?.map((u) => (
        <article className="adm-card split" key={u.id}>
          <div className="adm-main">
            <header>
              <strong>{u.display_name || u.username}</strong><span className="muted small">@{u.username}</span>
              {u.is_bot && <span className="bot-pill"><Icon name="bot" size={11} /> BOT</span>}
              {u.banned_at && <span className="adm-warn">Suspended</span>}
              {u.muted_until && new Date(u.muted_until) > new Date() && <span className="adm-warn">Timed out until {new Date(u.muted_until).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>}
              {u.reports_against > 0 && <span className="adm-cat">{u.reports_against} {u.reports_against === 1 ? 'report' : 'reports'}</span>}
            </header>
            <p className="muted tiny">Joined {new Date(u.created_at).toLocaleDateString()} · <button className="inline-link" onClick={() => navigator.clipboard?.writeText(u.id).then(() => notify('User ID copied.'))}>copy ID</button>{u.ban_reason ? ` · ${u.ban_reason}` : ''}</p>
          </div>
          <footer>
            {u.banned_at ? <button className="ghost small" onClick={() => ban(u, false)}>Lift suspension</button> : <button className="ghost small danger" onClick={() => ban(u, true)}><Icon name="ban" size={13} /> Suspend</button>}
            {u.muted_until && new Date(u.muted_until) > new Date()
              ? <button className="ghost small" onClick={() => mute(u, 0)}>Lift time-out</button>
              : <select className="adm-select" aria-label={`Time out @${u.username}`} value="" onChange={(e) => e.target.value && mute(u, Number(e.target.value))}>
                  <option value="">Time out…</option><option value="10">10 minutes</option><option value="60">1 hour</option><option value="1440">1 day</option><option value="10080">1 week</option>
                </select>}
            <button className="ghost small" onClick={() => setOpen(open === u.id ? null : u.id)} aria-expanded={open === u.id}><Icon name="chart" size={13} /> Details</button>
            <button className="ghost small" onClick={() => setEdit(edit === u.id ? null : u.id)} aria-expanded={edit === u.id}><Icon name="star" size={13} /> Badges</button>
          </footer>
          {open === u.id && <Detail id={u.id} />}
          {edit === u.id && <BadgeEditor u={u} onDone={() => { setEdit(null); search(q) }} />}
        </article>
      ))}
    </>
  )
}

function Bots() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const load = useCallback(async (text) => {
    const { data, error } = await supabase.rpc('admin_bots', { q: text.trim() })
    error ? (fail(error), setRows([])) : setRows(data || [])
  }, [])
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t) }, [q, load])
  async function ban(b, on) {
    let why = null
    if (on) { why = await promptDialog({ title: `Suspend @${b.username}?`, body: 'The bot can no longer post. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Suspend' }); if (!why) return }
    const { error } = await supabase.rpc('admin_set_ban', { uid: b.id, ban: on, why })
    error ? fail(error) : (notify(on ? 'Bot suspended.' : 'Suspension lifted.'), load(q))
  }
  async function revoke(b) {
    const why = await promptDialog({ title: `Revoke the token for @${b.username}?`, body: 'The bot is cut off at once. Its owner must make a new token in the developer portal. Add a reason for the log.', value: '', maxLength: 300, confirmLabel: 'Revoke token' })
    if (!why) return
    const { error } = await supabase.rpc('admin_revoke_bot_token', { bid: b.id, why })
    error ? fail(error) : (notify('Token revoked.'), load(q))
  }
  const online = (b) => b.last_seen && Date.now() - new Date(b.last_seen).getTime() < 75000
  return (
    <>
      <div className="adm-bar"><div className="adm-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bots by name or owner" aria-label="Search bots" /></div></div>
      {rows?.length === 0 && <div className="muted small adm-empty">No bots found.</div>}
      {rows?.map((b) => (
        <article className="adm-card split" key={b.id}>
          <div className="adm-main">
            <header>
              <strong>{b.display_name || b.username}</strong><span className="muted small">@{b.username}</span>
              <span className={online(b) ? 'adm-ok' : 'adm-cat'}>{online(b) ? 'Online' : 'Offline'}</span>
              {b.banned_at && <span className="adm-warn">Suspended</span>}
            </header>
            <p className="muted tiny">Owner @{b.owner_name || 'unknown'} · {b.groups} {Number(b.groups) === 1 ? 'group' : 'groups'} · {b.commands} {Number(b.commands) === 1 ? 'command' : 'commands'}{b.last_seen ? ` · seen ${ago(b.last_seen)}` : ' · never connected'}</p>
          </div>
          <footer>
            <button className="ghost small" onClick={() => revoke(b)}><Icon name="key" size={13} /> Revoke token</button>
            {b.banned_at ? <button className="ghost small" onClick={() => ban(b, false)}>Lift suspension</button> : <button className="ghost small danger" onClick={() => ban(b, true)}><Icon name="ban" size={13} /> Suspend</button>}
          </footer>
        </article>
      ))}
    </>
  )
}

function Errors() {
  const [rows, setRows] = useState(null)
  const load = () => supabase.rpc('admin_client_errors', { lim: 100 }).then(({ data, error }) => (error ? (fail(error), setRows([])) : setRows(data || [])))
  useEffect(() => { load() }, [])
  const clear = async () => { const { error } = await supabase.rpc('admin_clear_client_errors'); if (error) fail(error); else setRows([]) }
  if (!rows) return <div className="muted small adm-empty">Loading…</div>
  return (
    <>
      <div className="row between"><span className="muted small">Crashes people hit in the app, newest first. Kept for 30 days.</span>{rows.length > 0 && <button className="ghost small" onClick={clear}>Clear all</button>}</div>
      {rows.length === 0 && <div className="muted small adm-empty">No errors reported.</div>}
      {rows.map((r, i) => (
        <details key={i} className="adm-card">
          <summary><strong>{r.message}</strong> <span className="muted tiny">×{r.times} · {r.users} {Number(r.users) === 1 ? 'person' : 'people'} · {new Date(r.last_seen).toLocaleString()}</span></summary>
          <div className="muted tiny">{r.page}</div>
          {r.stack && <pre className="tiny" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 180 }}>{r.stack}</pre>}
        </details>
      ))}
    </>
  )
}

function Log() {
  const [rows, setRows] = useState(null)
  const [f, setF] = useState('')
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) { fail(error); return setRows([]) }
      const ids = [...new Set((data || []).map((r) => r.staff).filter(Boolean))]
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, username').in('id', ids) : { data: [] }
      const by = Object.fromEntries((ps || []).map((p) => [p.id, p.username]))
      setRows((data || []).map((r) => ({ ...r, who: by[r.staff] || 'staff' })))
    })()
  }, [])
  if (!rows) return <div className="muted small adm-empty">Loading…</div>
  if (!rows.length) return <div className="muted small adm-empty">Nothing has been logged yet.</div>
  const shown = rows.filter((r) => !f.trim() || `${r.who} ${r.action} ${r.detail || ''}`.toLowerCase().includes(f.trim().toLowerCase()))
  return <><div className="adm-bar"><div className="adm-search"><Icon name="search" size={14} /><input value={f} onChange={(e) => setF(e.target.value)} placeholder="Filter the log (name, action, detail)" aria-label="Filter the log" /></div></div>{shown.length === 0 ? <div className="muted small adm-empty">Nothing matches.</div> : <div className="adm-log">{shown.map((r) => <div key={r.id}><span className="muted tiny">{ago(r.created_at)}</span><span><strong>@{r.who}</strong> {r.action.replace(/_/g, ' ')}{r.detail ? <span className="muted"> · {r.detail}</span> : null}</span></div>)}</div>}</>
}

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('overview')
  const [bump, setBump] = useState(0)
  const [aal, setAal] = useState(null)
  useEffect(() => { supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal(data?.currentLevel || 'aal1'), () => setAal('aal1')) }, [])
  const tabs = [['overview', 'Overview', 'chart'], ['reports', 'Reports', 'flag'], ['users', 'People', 'users'], ['groups', 'Groups', 'grid'], ['bots', 'Bots', 'sparkle'], ['settings', 'Settings', 'settings'], ['log', 'Activity log', 'clock'], ['errors', 'Errors', 'alert']]
  return (
    <Modal title="Staff panel" onClose={onClose} wide>
      <div className="adm">
        {aal && aal !== 'aal2' ? (
          <div className="adm-card"><strong>Two-factor needed</strong><p className="muted small">Staff tools need a two-factor sign-in. Turn it on in Settings, Privacy and safety, then sign out and back in with your code.</p></div>
        ) : (
          <div className="adm-shell">
            <nav className="adm-nav" role="tablist" aria-label="Staff sections">
              {tabs.map(([id, l, ic]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon name={ic} size={16} /><span>{l}</span></button>)}
              <p className="muted tiny adm-foot"><Icon name="shield" size={12} /> Every action is logged with your name.</p>
            </nav>
            <div className="adm-body" key={tab}>
              <h3 className="adm-title">{tabs.find((t) => t[0] === tab)?.[1]}</h3>
              {tab === 'overview' && <Overview key={bump} go={setTab} />}
              {tab === 'reports' && <Reports onBadge={() => setBump((n) => n + 1)} />}
              {tab === 'users' && <Users />}
              {tab === 'groups' && <Groups />}
              {tab === 'bots' && <Bots />}
              {tab === 'settings' && <Settings />}
              {tab === 'log' && <Log />}
              {tab === 'errors' && <Errors />}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
