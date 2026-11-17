import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from './Modals.jsx'
import Avatar from './Avatar.jsx'
import { supabase } from '../supabase.js'
import { uploadMedia } from '../upload.js'
import { confirmDialog, notify } from '../dialog.jsx'
import { PERMS, PRESETS, makeConnectKey } from '../botDocs.js'
import { Starter } from './BotKit.jsx'
import Icon from './Icon.jsx'

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

function KeyBox({ bot, token, onDone }) {
  const key = makeConnectKey(token)
  return (
    <div className="token-box" role="alert">
      <strong>Your connect key for {bot.display_name}</strong>
      <p className="muted tiny">This one string is all your bot needs: no addresses to type. It is shown once, so download your bot folder now (the key is put inside for you) or copy it somewhere private. If you lose it, press "New key" (the old one then stops working).</p>
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
  const [tab, setTab] = useState('general')
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

  const online = bot.last_seen && Date.now() - new Date(bot.last_seen).getTime() < 75000
  const tabs = [['general', 'General'], ['perms', 'Permissions'], ['connect', 'Connect'], ['more', 'Danger zone']]
  return (
    <div className="bot-detail">
      <header className="bot-detail-head">
        <button className="plain" onClick={() => file.current?.click()} aria-label="Change bot picture" title="Change picture"><Avatar profile={{ id: bot.id, username: bot.username, display_name: bot.display_name, avatar_url: bot.avatar_url }} size={56} /></button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        <div className="bot-title"><strong>{bot.display_name} <span className="bot-tag">BOT</span></strong>
          <span className="muted small">@{bot.username} · in {Number(bot.groups)} group{Number(bot.groups) === 1 ? '' : 's'} · {Number(bot.commands || 0)} command{Number(bot.commands || 0) === 1 ? '' : 's'}</span></div>
        <span className={'bot-status ' + (online ? 'on' : '')}><i />{online ? 'Online' : 'Offline'}</span>
      </header>
      <div className="seg" role="tablist">{tabs.map(([id, l]) => <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
      {tab === 'general' && (
        <div className="form">
          <label>Name<input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /></label>
          <label>Description<input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="What does it do?" /></label>
          <label>Add code <span className="muted tiny">(give this to group managers so they can add the bot)</span>
            <div className="row nowrap"><input readOnly value={bot.add_code} onFocus={(e) => e.target.select()} /><button type="button" className="ghost" onClick={() => copy(bot.add_code, 'Add code copied.')}>Copy</button><button type="button" className="ghost" onClick={code}>New code</button></div>
          </label>
        </div>
      )}
      {tab === 'perms' && <PermPicker idp={`bp-${bot.id}`} value={perms} onChange={setPerms} />}
      {tab === 'connect' && (
        <div className="form">
          <p className="muted small">Your bot connects with a single connect key. Keys are only shown when they are made, so make a new one if you lost it (the old key stops working straight away).</p>
          <div className="row tight wrap"><button type="button" className="primary small" onClick={token}><Icon name="key" size={14} /> Make a new key</button></div>
          <Starter bot={bot} keyText={null} />
        </div>
      )}
      {tab === 'more' && (
        <div className="form">
          <p className="muted small">Deleting a bot removes it from every group and deletes all of its messages. This cannot be undone.</p>
          <div><button type="button" className="ghost small danger" onClick={del}><Icon name="trash" size={14} /> Delete {bot.display_name}</button></div>
        </div>
      )}
      {(tab === 'general' || tab === 'perms') && <div className="row tight"><button className="primary small" disabled={!dirty || busy} onClick={() => save()}>Save changes</button>{dirty && <span className="muted tiny">Unsaved changes</span>}</div>}
    </div>
  )
}

export default function DevPortal({ me, onClose }) {
  const [bots, setBots] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', description: '', perms: PRESETS[1][2] })
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)
  const [shown, setShown] = useState(null) // { id, token, bot } (the key is only known right after it is made)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_bots')
    if (error) { setErr(friendly(error)); return setBots([]) }
    const st = await supabase.rpc('my_bots_status') // newer SQL: is it running, how many commands (optional)
    const by = Object.fromEntries((st.data || []).map((x) => [x.id, x]))
    setBots((data || []).map((b) => ({ ...b, last_seen: by[b.id]?.last_seen || null, commands: by[b.id]?.commands ?? 0 })))
  }, [])
  const picked = useRef(false)
  useEffect(() => { reload() }, [reload])
  useEffect(() => { // on a wide screen, open the first bot straight away
    if (bots?.length && !picked.current) { picked.current = true; if (window.matchMedia('(min-width: 721px)').matches) setSel(bots[0].id) }
  }, [bots])

  async function create(e) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase.rpc('create_bot', { uname: form.username, dname: form.name, descr: form.description, perms: form.perms })
    if (error) return setErr(friendly(error))
    setCreating(false)
    setSel(data.id)
    setShown({ id: data.id, token: data.token, bot: { display_name: form.name || form.username, description: form.description } })
    setForm({ username: '', name: '', description: '', perms: PRESETS[1][2] })
    reload()
  }

  const cur = creating ? null : bots?.find((b) => b.id === sel) || null
  const showDetail = creating || cur || shown
  return (
    <Modal title="Developer portal" onClose={onClose} wide>
      <div className={'dev-portal dev-split' + (showDetail ? ' has-detail' : '')}>
        <aside className="dev-list" aria-label="Your bots">
          <button className="primary small dev-new" onClick={() => { setCreating(true); setErr('') }}><Icon name="plus" size={14} /> New bot</button>
          {bots === null && <p className="muted small">Loading…</p>}
          {bots?.map((b) => {
            const up = b.last_seen && Date.now() - new Date(b.last_seen).getTime() < 75000
            return (
              <button key={b.id} className={'dev-item' + (!creating && cur?.id === b.id ? ' on' : '')} onClick={() => { setSel(b.id); setCreating(false); setErr('') }}>
                <Avatar profile={{ id: b.id, username: b.username, display_name: b.display_name, avatar_url: b.avatar_url }} size={34} />
                <span className="dev-item-text"><strong>{b.display_name}</strong><small>@{b.username}</small></span>
                <i className={'dev-dot' + (up ? ' on' : '')} title={up ? 'Online' : 'Offline'} />
              </button>
            )
          })}
          <a className="dev-docs" href="/developers" target="_blank" rel="noreferrer"><Icon name="external" size={13} /> Documentation</a>
        </aside>
        <section className="dev-pane">
          <button className="ghost small dev-back" onClick={() => { setSel(null); setCreating(false); setShown(null) }}><Icon name="chevron" size={14} /> All bots</button>
          {err && <div className="error" role="alert">{err}</div>}
          {shown && <KeyBox bot={shown.bot || bots?.find((x) => x.id === shown.id) || { display_name: 'your bot' }} token={shown.token} onDone={() => setShown(null)} />}
          {creating && (
            <form className="bot-detail form" onSubmit={create}>
              <h3 className="dev-h">Create a bot</h3>
              <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} maxLength={20} placeholder="mybot" required autoFocus /></label>
              <label>Display name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={32} placeholder="My Bot" /></label>
              <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="What does it do?" /></label>
              <PermPicker idp="new" value={form.perms} onChange={(perms) => setForm({ ...form, perms })} />
              <div className="row tight"><button className="primary" disabled={form.username.length < 3}>Create</button><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button></div>
            </form>
          )}
          {cur && !creating && <BotCard key={cur.id} bot={cur} me={me} reload={reload} onToken={(id, token) => setShown({ id, token, bot: cur })} />}
          {!showDetail && bots && (
            <div className="empty-state">
              <strong>{bots.length ? 'Pick a bot' : 'No bots yet'}</strong>
              <span className="muted small">{bots.length ? 'Choose one from the list to edit it, see its key and permissions.' : 'Press New bot to make your first one. The documentation walks you through the rest.'}</span>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
