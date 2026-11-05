import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from './Modals.jsx'
import Avatar from './Avatar.jsx'
import { supabase } from '../supabase.js'
import { uploadMedia } from '../upload.js'
import { confirmDialog, notify } from '../dialog.jsx'
import { PERMS, PRESETS, TEMPLATES, makeConnectKey, buildStarter, START_BAT, aiPrompt, download } from '../botDocs.js'

const friendly = (e) => (/function|schema cache/i.test(e?.message || '') ? 'Bots need update_v24, update_v25 and update_v26 to be run in Supabase first.' : e?.message || 'Something went wrong.')
const copy = (t, msg = 'Copied.') => navigator.clipboard?.writeText(t).then(() => notify(msg), () => notify('Could not copy.', 'error'))

function PermPicker({ value, onChange, idp }) {
  const preset = PRESETS.find(([, , p]) => p.length === value.length && p.every((x) => value.includes(x)))
  return (
    <fieldset className="perm-picker">
      <legend>What may this bot do in a group? <span className="muted tiny">(its default permissions)</span></legend>
      <div className="row tight wrap" role="group" aria-label="Presets">
        {PRESETS.map(([id, name, perms, d]) => (
          <button key={id} type="button" className={'gif-cat' + (preset?.[0] === id ? ' on' : '')} aria-pressed={preset?.[0] === id} title={d} onClick={() => onChange(perms)}>{name}</button>
        ))}
        {!preset && <span className="muted tiny">Custom</span>}
      </div>
      <p className="muted tiny">{preset ? preset[3] : 'A custom mix.'} Every bot can always read and chat. These apply when a group founder adds it, and can be changed in Group settings.</p>
      <div className="perm-list">
        {PERMS.map(([id, d]) => (
          <label key={id} className="perm-row"><input type="checkbox" id={`${idp}-${id}`} checked={value.includes(id)} onChange={(e) => onChange(e.target.checked ? [...value, id] : value.filter((x) => x !== id))} /><span><code>{id}</code> <span className="muted tiny">{d}</span></span></label>
        ))}
      </div>
    </fieldset>
  )
}

function Starter({ bot, keyText }) {
  const [tpl, setTpl] = useState('hello')
  const [busy, setBusy] = useState(false)
  const t = TEMPLATES.find((x) => x[0] === tpl)
  const get = async () => {
    setBusy(true)
    try {
      download('mybot.mjs', await buildStarter(tpl, keyText || null))
      download('start.bat', START_BAT)
      notify(keyText ? 'Downloaded. Put both files in one folder and double-click start.bat.' : 'Downloaded. Open mybot.mjs and paste your connect key where it says PASTE-YOUR-CONNECT-KEY.')
    } catch { notify('Could not build the starter. Check your connection.', 'error') }
    setBusy(false)
  }
  return (
    <div className="starter">
      <label>Starter bot
        <select value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      </label>
      <p className="muted tiny">{t?.[2]}</p>
      <div className="row tight wrap">
        <button className="primary small" disabled={busy} onClick={get}>{busy ? 'Preparing…' : 'Download starter'}</button>
        <button className="ghost small" onClick={() => copy(aiPrompt(`A bot called ${bot.display_name}. ${bot.description || ''}`), 'Copied. Paste it into ChatGPT, Claude or Gemini and add what you want.')}>Copy brief for ChatGPT</button>
        <a className="button-link ghost small" href="/developers#starter" target="_blank" rel="noreferrer">How it works</a>
      </div>
      {!keyText && <p className="muted tiny">The key is only shown when a bot is made or when you press "New key", so a later download has a spot to paste it. (Or set NOOK_KEY on your PC and leave the file as it is.)</p>}
    </div>
  )
}

function KeyBox({ bot, token, onDone }) {
  const key = makeConnectKey(token)
  return (
    <div className="token-box" role="alert">
      <strong>Your connect key for {bot.display_name}</strong>
      <p className="muted tiny">This one string is all your bot needs: no addresses to type. It is shown once, so download the starter now or copy it somewhere private. If you lose it, press "New key" (the old one then stops working).</p>
      <div className="row nowrap"><input readOnly value={key} onFocus={(e) => e.target.select()} aria-label="Connect key" /><button className="primary" onClick={() => copy(key, 'Connect key copied.')}>Copy</button></div>
      <Starter bot={bot} keyText={key} />
      <button className="ghost small" onClick={onDone}>I have saved it</button>
    </div>
  )
}

function BotCard({ bot, me, reload, onToken }) {
  const [name, setName] = useState(bot.display_name)
  const [desc, setDesc] = useState(bot.description || '')
  const [busy, setBusy] = useState(false)
  const [perms, setPerms] = useState(bot.default_perms || [])
  const [open, setOpen] = useState(false)
  const file = useRef(null)
  const permsDirty = [...perms].sort().join() !== [...(bot.default_perms || [])].sort().join()
  const dirty = name !== bot.display_name || desc !== (bot.description || '') || permsDirty

  const save = async (avatar = bot.avatar_url) => {
    setBusy(true)
    let { error } = await supabase.rpc('update_bot', { bid: bot.id, dname: name, descr: desc, avatar: avatar || '' })
    if (!error && permsDirty) ({ error } = await supabase.rpc('set_bot_default_perms', { bid: bot.id, perms }))
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
    if (!(await confirmDialog({ title: 'Make a new key?', body: 'The old key stops working straight away. Your running bot will need the new one.', confirmLabel: 'Make new key' }))) return
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
      <PermPicker idp={`bp-${bot.id}`} value={perms} onChange={setPerms} />
      <label>Add code <span className="muted tiny">(give this to group managers so they can add the bot; it joins with the permissions above)</span>
        <div className="row nowrap"><input readOnly value={bot.add_code} onFocus={(e) => e.target.select()} /><button className="ghost" onClick={() => copy(bot.add_code, 'Add code copied.')}>Copy</button><button className="icon-btn" title="New add code" aria-label="New add code" onClick={code}>↻</button></div>
      </label>
      <div className="row tight wrap">
        <button className="primary small" disabled={!dirty || busy} onClick={() => save()}>Save</button>
        <button className="ghost small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide starter' : 'Starter and AI help'}</button>
        <button className="ghost small" onClick={token}>New key</button>
        <button className="ghost small danger" onClick={del}>Delete</button>
      </div>
      {open && <Starter bot={bot} keyText={null} />}
    </div>
  )
}

export default function DevPortal({ me, onClose }) {
  const [bots, setBots] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', description: '', perms: PRESETS[1][2] })
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(null) // { id, token, bot } (the key is only known right after it is made)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_bots')
    if (error) { setErr(friendly(error)); return setBots([]) }
    setBots(data || [])
  }, [])
  useEffect(() => { reload() }, [reload])

  async function create(e) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase.rpc('create_bot', { uname: form.username, dname: form.name, descr: form.description, perms: form.perms })
    if (error) return setErr(friendly(error))
    setCreating(false)
    setShown({ id: data.id, token: data.token, bot: { display_name: form.name || form.username, description: form.description } })
    setForm({ username: '', name: '', description: '', perms: PRESETS[1][2] })
    reload()
  }

  return (
    <Modal title="Developer portal" onClose={onClose} wide>
      <div className="form dev-portal">
        <p className="muted small">Make bots that join your groups. Each one gets a single connect key, so there is nothing to type. They run on your own computer (or any server), and you can build them with ChatGPT or similar, or from a ready-made starter.</p>
        <div className="row tight wrap">
          <a className="button-link ghost small" href="/developers" target="_blank" rel="noreferrer">Read the documentation</a>
          <button className="primary small" onClick={() => { setCreating((v) => !v); setErr('') }}>{creating ? 'Cancel' : 'Create a bot'}</button>
        </div>

        {shown && <KeyBox bot={shown.bot || bots?.find((x) => x.id === shown.id) || { display_name: 'your bot' }} token={shown.token} onDone={() => setShown(null)} />}

        {creating && (
          <form className="bot-card" onSubmit={create}>
            <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} maxLength={20} placeholder="mybot" required /></label>
            <label>Display name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={32} placeholder="My Bot" /></label>
            <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="What does it do?" /></label>
            <PermPicker idp="new" value={form.perms} onChange={(perms) => setForm({ ...form, perms })} />
            <button className="primary" disabled={form.username.length < 3}>Create</button>
          </form>
        )}
        {err && <div className="error" role="alert">{err}</div>}

        {bots === null ? <p className="muted small">Loading…</p> : bots.length === 0 && !creating ? (
          <div className="empty-state"><strong>No bots yet</strong><span className="muted small">Press "Create a bot" to make your first one. The documentation walks you through the rest.</span></div>
        ) : bots.map((b) => (
          <div key={b.id}>
            {shown?.id === b.id && null}
            <BotCard bot={b} me={me} reload={reload} onToken={(id, token) => setShown({ id, token, bot: b })} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
