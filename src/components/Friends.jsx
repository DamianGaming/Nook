import { activityText } from '../status.js'
import { Name } from '../cosmetics.jsx'
import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Modal } from './Modals.jsx'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { confirmDialog, notify } from '../dialog.jsx'

const name = (p) => p?.display_name || p?.username || 'Someone'

function Person({ p, sub, children }) {
  return (
    <div className="friend-row">
      <Avatar profile={p} size={36} status />
      <span className="friend-text">
        <strong className="ellipsis"><Name profile={p} /></strong>
        <span className="muted tiny ellipsis">{sub || `@${p?.username}`}</span>
      </span>
      <span className="friend-actions">{children}</span>
    </div>
  )
}

/* Friends: everyone you are friends with, requests waiting for you, and a box to add someone by username. */
export default function Friends({ friends, onClose, onOpenDM, onChanged, startTab = 'all' }) {
  const [tab, setTab] = useState(startTab)
  const [uname, setUname] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const accepted = friends.filter((f) => f.status === 'accepted')
  const incoming = friends.filter((f) => f.status === 'pending' && f.incoming)
  const outgoing = friends.filter((f) => f.status === 'pending' && !f.incoming)

  async function add(e) {
    e.preventDefault()
    const u = uname.trim().replace(/^@/, '')
    if (!u) return
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('send_friend_request', { uname: u })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setUname('')
    setMsg({
      text:
        data === 'sent' ? `Friend request sent to @${u}.`
        : data === 'accepted' ? `You and @${u} are now friends.`
        : data === 'already' ? `You are already friends with @${u}.`
        : `You already asked @${u}. They have not answered yet.`,
    })
    onChanged()
  }

  async function respond(f, accept) {
    const { data, error } = await supabase.rpc('respond_friend_request', { fid: f.id, accept })
    if (error) return notify(error.message, 'error')
    onChanged()
    if (accept) {
      notify(`You and ${name(f.other)} are now friends.`)
      if (data) onOpenDM(f.other.id, data)
    }
  }

  async function remove(f, title, body, label) {
    if (!(await confirmDialog({ title, body, confirmLabel: label, danger: true }))) return
    const { error } = await supabase.from('friendships').delete().eq('id', f.id)
    error ? notify(error.message, 'error') : onChanged()
  }

  const tabs = [
    ['all', 'Friends', accepted.length],
    ['pending', 'Requests', incoming.length],
    ['add', 'Add friend', 0],
  ]

  return (
    <Modal title="Friends" onClose={onClose}>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}{n > 0 && <span className={id === 'pending' ? 'count inline' : 'tab-n'}>{n}</span>}
          </button>
        ))}
      </div>

      <div className="form friends-body">
        {tab === 'all' && (
          accepted.length === 0 ? (
            <div className="friends-empty"><Icon name="users" size={26} /><p>No friends yet.</p><button className="primary" onClick={() => setTab('add')}><Icon name="plus" size={15} /> Add a friend</button></div>
          ) : (
            accepted.map((f) => (
              <Person key={f.id} p={f.other} sub={activityText(f.other) || f.other?.status_text}>
                <button className="icon-btn" title="Message" aria-label={`Message ${name(f.other)}`} onClick={() => onOpenDM(f.other.id)}><Icon name="message" size={16} /></button>
                <button className="icon-btn danger" title="Remove friend" aria-label={`Remove ${name(f.other)}`} onClick={() => remove(f, `Remove ${name(f.other)}?`, 'You can add each other again later. Your chat history stays.', 'Remove')}><Icon name="x" size={16} /></button>
              </Person>
            ))
          )
        )}

        {tab === 'pending' && (
          <>
            {incoming.length === 0 && outgoing.length === 0 && <div className="friends-empty"><Icon name="bell" size={26} /><p>No requests right now.</p></div>}
            {incoming.length > 0 && <div className="section">Waiting for you</div>}
            {incoming.map((f) => (
              <Person key={f.id} p={f.other} sub="Wants to be friends">
                <button className="icon-btn ok" title="Accept" aria-label={`Accept ${name(f.other)}`} onClick={() => respond(f, true)}><Icon name="check" size={16} /></button>
                <button className="icon-btn danger" title="Decline" aria-label={`Decline ${name(f.other)}`} onClick={() => respond(f, false)}><Icon name="x" size={16} /></button>
              </Person>
            ))}
            {outgoing.length > 0 && <div className="section">Sent by you</div>}
            {outgoing.map((f) => (
              <Person key={f.id} p={f.other} sub="Waiting for an answer">
                <button className="ghost small" onClick={() => remove(f, 'Cancel this request?', `${name(f.other)} will not be asked.`, 'Cancel request')}>Cancel</button>
              </Person>
            ))}
          </>
        )}

        {tab === 'add' && (
          <form onSubmit={add} className="add-friend">
            <p className="muted">Type their username. When they accept, you get a private chat.</p>
            <div className="row nowrap">
              <input autoFocus placeholder="username" value={uname} onChange={(e) => setUname(e.target.value)} maxLength={24} autoCapitalize="none" autoCorrect="off" spellCheck="false" aria-label="Username" />
              <button className="primary" disabled={busy || !uname.trim()}>{busy ? 'Sending…' : 'Send request'}</button>
            </div>
            {msg && <div className={msg.bad ? 'error' : 'info'}>{msg.text}</div>}
          </form>
        )}
      </div>
    </Modal>
  )
}
