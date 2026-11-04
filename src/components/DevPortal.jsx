import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from './Modals.jsx'
import Avatar from './Avatar.jsx'
import { supabase } from '../supabase.js'
import { uploadMedia } from '../upload.js'
import { confirmDialog, notify } from '../dialog.jsx'

const friendly = (e) => (/function|schema cache/i.test(e?.message || '') ? 'Bots need update_v24.sql to be run in Supabase first.' : e?.message || 'Something went wrong.')
const copy = (t, msg = 'Copied.') => navigator.clipboard?.writeText(t).then(() => notify(msg), () => notify('Could not copy.', 'error'))
const URL_ = import.meta.env.VITE_SUPABASE_URL || ''
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function TokenBox({ token, onDone }) {
  return (
    <div className="token-box" role="alert">
      <strong>Copy your bot's token now</strong>
      <p className="muted tiny">This is the only time it is shown. If you lose it you can make a new one, and the old one will stop working.</p>
      <div className="row nowrap"><input readOnly value={token} onFocus={(e) => e.target.select()} aria-label="Bot token" /><button className="primary" onClick={() => copy(token, 'Token copied.')}>Copy</button></div>
      <button className="ghost small" onClick={onDone}>I have saved it</button>
    </div>
  )
}

function BotCard({ bot, me, reload, onToken }) {
  const [name, setName] = useState(bot.display_name)
  const [desc, setDesc] = useState(bot.description || '')
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  const dirty = name !== bot.display_name || desc !== (bot.description || '')

  const save = async (avatar = bot.avatar_url) => {
    setBusy(true)
    const { error } = await supabase.rpc('update_bot', { bid: bot.id, dname: name, descr: desc, avatar: avatar || '' })
    setBusy(false)
    if (error) return notify(friendly(error), 'error')
    notify('Saved.')
    reload()
  }
  const pick = async (f) => {
    if (!f) return
    try { setBusy(true); const url = await uploadMedia(me.id, f, 'avatar'); await save(url) } catch (e) { setBusy(false); notify(e.message, 'error') }
  }
  const token = async () => {
    if (!(await confirmDialog({ title: 'Make a new token?', body: 'The old token stops working straight away. Your running bot will need the new one.', confirmLabel: 'Make new token' }))) return
    const { data, error } = await supabase.rpc('regenerate_bot_token', { bid: bot.id })
    if (error) return notify(friendly(error), 'error')
    onToken(bot.id, data)
  }
  const code = async () => {
    if (!(await confirmDialog({ title: 'Make a new add code?', body: 'The old code stops working. Bots already in groups stay there.', confirmLabel: 'Make new code' }))) return
    const { error } = await supabase.rpc('regenerate_bot_code', { bid: bot.id })
    if (error) return notify(friendly(error), 'error')
    reload()
  }
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete ${bot.display_name}?`, body: 'It leaves every group and all of its messages are removed. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    const { error } = await supabase.rpc('delete_bot', { bid: bot.id })
    if (error) return notify(friendly(error), 'error')
    reload()
  }

  return (
    <div className="bot-card">
      <div className="row nowrap">
        <button className="plain" onClick={() => file.current?.click()} aria-label="Change bot picture" title="Change picture"><Avatar profile={{ id: bot.id, username: bot.username, display_name: bot.display_name, avatar_url: bot.avatar_url }} size={52} /></button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        <div className="bot-title"><strong>{bot.display_name} <span className="bot-tag">BOT</span></strong><span className="muted tiny">@{bot.username} · in {Number(bot.groups)} group{Number(bot.groups) === 1 ? '' : 's'}</span></div>
      </div>
      <label>Name<input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /></label>
      <label>Description<input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="What does it do?" /></label>
      <label>Add code <span className="muted tiny">(give this to group managers so they can add the bot)</span>
        <div className="row nowrap"><input readOnly value={bot.add_code} onFocus={(e) => e.target.select()} /><button className="ghost" onClick={() => copy(bot.add_code, 'Add code copied.')}>Copy</button><button className="icon-btn" title="New add code" aria-label="New add code" onClick={code}>↻</button></div>
      </label>
      <div className="row tight wrap">
        <button className="primary small" disabled={!dirty || busy} onClick={() => save()}>Save</button>
        <button className="ghost small" onClick={token}>New token</button>
        <button className="ghost small danger" onClick={del}>Delete</button>
      </div>
    </div>
  )
}

export default function DevPortal({ me, onClose }) {
  const [bots, setBots] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', description: '' })
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(null) // { id, token }

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_bots')
    if (error) { setErr(friendly(error)); return setBots([]) }
    setBots(data || [])
  }, [])
  useEffect(() => { reload() }, [reload])

  async function create(e) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase.rpc('create_bot', { uname: form.username, dname: form.name, descr: form.description })
    if (error) return setErr(friendly(error))
    setCreating(false)
    setForm({ username: '', name: '', description: '' })
    setShown({ id: data.id, token: data.token })
    reload()
  }

  return (
    <Modal title="Developer portal" onClose={onClose} wide>
      <div className="form dev-portal">
        <p className="muted small">Make bots that join your groups. They run on your own computer (or any server) and talk to Nook over the internet.</p>
        <div className="row tight wrap">
          <a className="button-link ghost small" href="/developers" target="_blank" rel="noreferrer">Read the documentation</a>
          <button className="primary small" onClick={() => { setCreating((v) => !v); setErr('') }}>{creating ? 'Cancel' : 'Create a bot'}</button>
        </div>

        {URL_ && (
          <details className="conn">
            <summary>Your connection details</summary>
            <p className="muted tiny">These two values go in every bot. They are not secret.</p>
            <div className="row nowrap"><input readOnly value={URL_} aria-label="Project URL" onFocus={(e) => e.target.select()} /><button className="ghost small" onClick={() => copy(URL_)}>Copy</button></div>
            <div className="row nowrap"><input readOnly value={KEY_} aria-label="Anon key" onFocus={(e) => e.target.select()} /><button className="ghost small" onClick={() => copy(KEY_)}>Copy</button></div>
          </details>
        )}

        {shown && <TokenBox token={shown.token} onDone={() => setShown(null)} />}

        {creating && (
          <form className="bot-card" onSubmit={create}>
            <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} maxLength={20} placeholder="mybot" required /></label>
            <label>Display name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={32} placeholder="My Bot" /></label>
            <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="What does it do?" /></label>
            <button className="primary" disabled={form.username.length < 3}>Create</button>
          </form>
        )}
        {err && <div className="error" role="alert">{err}</div>}

        {bots === null ? <p className="muted small">Loading…</p> : bots.length === 0 && !creating ? (
          <div className="empty-state"><strong>No bots yet</strong><span className="muted small">Press "Create a bot" to make your first one. The documentation walks you through the rest.</span></div>
        ) : bots.map((b) => (
          <div key={b.id}>
            {shown?.id === b.id && null}
            <BotCard bot={b} me={me} reload={reload} onToken={(id, token) => setShown({ id, token })} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
