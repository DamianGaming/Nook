import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Modal } from './Modals.jsx'
import { GroupIcon } from './Avatar.jsx'
import Icon from './Icon.jsx'

/* Shown when someone enters a group that has a welcome message or rules. Rules must be accepted before posting. */
export default function Welcome({ group, needsRules, channels, onDone, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = channels.find((c) => c.id === group.first_channel) || null

  async function agree() {
    setBusy(true)
    setError('')
    if (needsRules) {
      const { error } = await supabase.rpc('accept_rules', { gid: group.id })
      if (error) { setBusy(false); return setError(error.message) }
    }
    setBusy(false)
    onDone(first?.id || null)
  }

  return (
    <Modal title={`Welcome to ${group.name}`} onClose={onClose}>
      <div className="form welcome">
        <div className="row"><GroupIcon group={group} size={48} /><strong className="welcome-name">{group.name}</strong></div>
        {group.welcome && <p className="welcome-text">{group.welcome}</p>}
        {group.rules && (
          <>
            <div className="section"><Icon name="shield" size={13} /> Group rules</div>
            <div className="rules-box" tabIndex={0}>{group.rules}</div>
          </>
        )}
        {error && <div className="error">{error}</div>}
        {needsRules ? (
          <div className="row">
            <button className="primary" disabled={busy} onClick={agree}>I agree{first ? ` and go to #${first.name}` : ''}</button>
            <button className="ghost" onClick={onClose}>Just look around</button>
          </div>
        ) : (
          <button className="primary" onClick={agree}>{first ? `Take me to #${first.name}` : 'Let’s go'}</button>
        )}
        {needsRules && <span className="muted tiny">Until you agree you can read the group but not post.</span>}
      </div>
    </Modal>
  )
}
