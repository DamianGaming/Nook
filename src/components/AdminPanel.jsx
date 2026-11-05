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
const fail = (error) => notify(/function|schema cache/i.test(error.message) ? 'Run update_v13.sql in Supabase first.' : error.message, 'error')

function exportCsv(rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['when', 'category', 'reporter', 'reported', 'reason', 'message', 'resolved', 'note']
  const body = rows.map((r) => [r.created_at, r.category, r.reporter_name, r.reported_name, r.reason, r.snapshot, r.resolved, r.note].map(cell).join(','))
  const url = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = `nook-reports-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function Overview() {
  const [s, setS] = useState(null)
  useEffect(() => { supabase.rpc('admin_stats').then(({ data, error }) => (error ? fail(error) : setS(data))) }, [])
  const items = [['users', 'People'], ['new_users_24h', 'New today'], ['groups', 'Groups'], ['messages_24h', 'Messages today'], ['open_reports', 'Open reports'], ['banned', 'Suspended']]
  return (
    <>
    <div className="adm-stats">
      {items.map(([k, label]) => <div className={`adm-stat ${k === 'open_reports' && s?.[k] > 0 ? 'hot' : ''}`} key={k}><strong>{s ? s[k] : '–'}</strong><span>{label}</span></div>)}
    </div>
    {s?.signups_7d && (
      <div className="adm-chart" aria-label="People joining each day for the last week">
        <div className="adm-bars">{s.signups_7d.map((n, i) => <i key={i} style={{ height: `${Math.max(6, (n / Math.max(1, ...s.signups_7d)) * 100)}%` }} title={`${n} joined`}><b>{n}</b></i>)}</div>
        <span className="muted tiny">People joining, last 7 days</span>
      </div>
    )}
    </>
  )
}

function Groups() {
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
  return (
    <>
      <div className="adm-bar"><div className="adm-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups by name or ID" aria-label="Search groups" /></div></div>
      {rows?.length === 0 && <div className="muted small adm-empty">No groups found.</div>}
      {rows?.map((g) => (
        <article className="adm-card split" key={g.id}>
          <div className="adm-main">
            <header><strong>{g.name}</strong><span className="adm-cat">{g.members} {g.members === 1 ? 'member' : 'members'}</span><span className="muted tiny">{g.channels} channels</span></header>
            <p className="muted tiny">@{g.founder || 'unknown'} · {new Date(g.created_at).toLocaleDateString()} · <button className="inline-link" onClick={() => navigator.clipboard?.writeText(g.id).then(() => notify('Group ID copied.'))}>copy ID</button></p>
          </div>
          <footer><button className="icon-btn danger" title="Delete group" aria-label="Delete group" onClick={() => del(g)}><Icon name="trash" size={14} /></button></footer>
        </article>
      ))}
    </>
  )
}

function Notice() {
  const [text, setText] = useState('')
  const [level, setLevel] = useState('info')
  useEffect(() => { supabase.from('site_notice').select('body, level').eq('id', 1).maybeSingle().then(({ data }) => { if (data) { setText(data.body || ''); setLevel(data.level) } }) }, [])
  async function save(clear) {
    const { error } = await supabase.rpc('admin_set_notice', { text_in: clear ? '' : text, lvl: level })
    error ? fail(error) : (notify(clear ? 'Announcement removed.' : 'Announcement published.'), clear && setText(''))
  }
  return (
    <div className="adm-card">
      <strong>Announcement</strong>
      <p className="muted small">A banner shown to everyone at the top of Nook. People can dismiss it. Leave it empty for none.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} placeholder="Planned maintenance tonight at 10pm" aria-label="Announcement text" />
      <div className="adm-chips"><button type="button" className={`choice small ${level === 'info' ? 'on' : ''}`} onClick={() => setLevel('info')}>Info</button><button type="button" className={`choice small ${level === 'warn' ? 'on' : ''}`} onClick={() => setLevel('warn')}>Warning</button></div>
      <footer><button className="primary small" onClick={() => save(false)} disabled={!text.trim()}>Publish</button><button className="ghost small" onClick={() => save(true)}>Remove</button></footer>
    </div>
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

function Users() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
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
              {u.banned_at && <span className="adm-warn">Suspended</span>}
              {u.reports_against > 0 && <span className="adm-cat">{u.reports_against} {u.reports_against === 1 ? 'report' : 'reports'}</span>}
            </header>
            <p className="muted tiny">Joined {new Date(u.created_at).toLocaleDateString()} · <button className="inline-link" onClick={() => navigator.clipboard?.writeText(u.id).then(() => notify('User ID copied.'))}>copy ID</button>{u.ban_reason ? ` · ${u.ban_reason}` : ''}</p>
          </div>
          <footer>
            {u.banned_at ? <button className="ghost small" onClick={() => ban(u, false)}>Lift suspension</button> : <button className="ghost small danger" onClick={() => ban(u, true)}><Icon name="ban" size={13} /> Suspend</button>}
            <button className="ghost small" onClick={() => setEdit(edit === u.id ? null : u.id)} aria-expanded={edit === u.id}><Icon name="star" size={13} /> Badges</button>
          </footer>
          {edit === u.id && <BadgeEditor u={u} onDone={() => { setEdit(null); search(q) }} />}
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
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(60)
      if (error) { fail(error); return setRows([]) }
      const ids = [...new Set((data || []).map((r) => r.staff).filter(Boolean))]
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, username').in('id', ids) : { data: [] }
      const by = Object.fromEntries((ps || []).map((p) => [p.id, p.username]))
      setRows((data || []).map((r) => ({ ...r, who: by[r.staff] || 'staff' })))
    })()
  }, [])
  if (!rows) return <div className="muted small adm-empty">Loading…</div>
  if (!rows.length) return <div className="muted small adm-empty">Nothing has been logged yet.</div>
  return <div className="adm-log">{rows.map((r) => <div key={r.id}><span className="muted tiny">{ago(r.created_at)}</span><span><strong>@{r.who}</strong> {r.action.replace(/_/g, ' ')}{r.detail ? <span className="muted"> · {r.detail}</span> : null}</span></div>)}</div>
}

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('reports')
  const [bump, setBump] = useState(0)
  const [aal, setAal] = useState(null)
  useEffect(() => { supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal(data?.currentLevel || 'aal1'), () => setAal('aal1')) }, [])
  const tabs = [['reports', 'Reports'], ['users', 'People'], ['groups', 'Groups'], ['notice', 'Notice'], ['overview', 'Stats'], ['log', 'Log'], ['errors', 'Errors']]
  return (
    <Modal title="Staff panel" onClose={onClose}>
      <div className="adm">
        {aal && aal !== 'aal2' ? (
          <div className="adm-card"><strong>Two-factor needed</strong><p className="muted small">Staff tools need a two-factor sign-in. Turn it on in Settings, Privacy and safety, then sign out and back in with your code.</p></div>
        ) : (
          <>
            <div className="adm-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
            <div className="adm-body" key={tab}>
              {tab === 'overview' && <Overview key={bump} />}
              {tab === 'reports' && <Reports onBadge={() => setBump((n) => n + 1)} />}
              {tab === 'users' && <Users />}
              {tab === 'groups' && <Groups />}
              {tab === 'notice' && <Notice />}
              {tab === 'log' && <Log />}
              {tab === 'errors' && <Errors />}
            </div>
          </>
        )}
        <p className="muted tiny adm-foot"><Icon name="shield" size={12} /> Every action here is logged with your name.</p>
      </div>
    </Modal>
  )
}
