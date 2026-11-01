import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { Link } from './Legal.jsx'
import { confirmDialog, notify } from '../dialog.jsx'
import { useE2ee, requestE2eeDialog, setupKeys, unlockKeys, changePassphrase, setPassphraseMode, makeRecoveryKey, lockDevice, exportMyData, canCrypto } from '../e2ee.js'

function Frame({ title, icon = 'lock', onClose, children, foot }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay front" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm enc" role="dialog" aria-modal="true" aria-label={title}>
        <div className="confirm-body">
          <span className="share-ico"><Icon name={icon} size={22} /></span>
          <h2>{title}</h2>
          {children}
        </div>
        {foot}
      </div>
    </div>
  )
}

const strength = (p) => {
  let s = 0
  if (p.length >= 10) s++
  if (p.length >= 14) s++
  if (/[a-z]/.test(p) && /[A-Z0-9]/.test(p)) s++
  if (p.trim().split(/\s+/).length >= 4) s++
  return Math.min(s, 4)
}

/* One dialog for the optional steps: unlock (passphrase accounts), add or remove your own passphrase, change it, reset. */
export function E2eeDialog({ me, mode, onClose }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [c, setC] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const first = useRef(null)
  useEffect(() => { first.current?.focus() }, [mode])
  const adding = mode === 'addpass'
  const strict = mode === 'strict'
  const [rk] = useState(() => (mode === 'strict' ? makeRecoveryKey() : ''))
  const st = strength(adding ? a : mode === 'change' ? b : '')

  async function go(e) {
    e.preventDefault()
    setErr('')
    if (strict && !ok) return setErr('Please tick the box to say you saved your recovery key.')
    if (adding) {
      if (a.length < 10) return setErr('Use at least 10 characters. A few words in a row works well.')
      if (a !== b) return setErr('The two passphrases do not match.')
      if (!ok) return setErr('Please tick the box to say you understand.')
    }
    if (mode === 'change') {
      if (b.length < 10) return setErr('Use at least 10 characters for the new passphrase.')
      if (b !== c) return setErr('The two new passphrases do not match.')
    }
    setBusy(true)
    try {
      if (adding) await setPassphraseMode(me.id, { passphrase: a })
      else if (strict) await setPassphraseMode(me.id, { passphrase: rk })
      else if (mode === 'removepass') await setPassphraseMode(me.id, { passphrase: null, current: a })
      else if (mode === 'reset') await setupKeys(me.id, null)
      else if (mode === 'unlock') await unlockKeys(me.id, a)
      else if (mode === 'change') await changePassphrase(me.id, a, b)
      notify({ strict: 'Full end-to-end encryption is on.', addpass: 'Your own passphrase is now protecting your key.', removepass: 'Back to automatic protection.', reset: 'Encryption was reset with a new key.', unlock: 'Unlocked.', change: 'Passphrase changed.' }[mode])
      onClose()
    } catch (e2) {
      setErr(e2.message || 'Something went wrong.')
      setBusy(false)
    }
  }

  const titles = { strict: 'Full end-to-end encryption', addpass: 'Add your own passphrase', removepass: 'Go back to automatic', unlock: 'Unlock your messages', reset: 'Reset encryption', change: 'Change your passphrase' }
  const needsCurrent = mode === 'unlock' || mode === 'change' || mode === 'removepass'
  return (
    <Frame title={titles[mode]} onClose={onClose} foot={null}>
      <form className="form" onSubmit={go}>
        {strict && (
          <>
            <p className="muted">Right now Nook looks after your key for you. In full end-to-end mode nobody but you holds it, not even Nook. Save this recovery key somewhere safe, like a password manager. You will need it to read your messages on a new device. This device stays unlocked.</p>
            <div className="rkey" aria-label="Recovery key"><code>{rk}</code></div>
            <div className="row">
              <button type="button" className="ghost small" onClick={() => navigator.clipboard?.writeText(rk).then(() => notify('Copied.'), () => notify('Could not copy.', 'error'))}><Icon name="copy" size={13} /> Copy</button>
              <button type="button" className="ghost small" onClick={() => { const u = URL.createObjectURL(new Blob([`Nook recovery key\n\n${rk}\n\nKeep this private. Anyone with it can read your direct messages.\n`], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = 'nook-recovery-key.txt'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 3000) }}><Icon name="download" size={13} /> Download</button>
            </div>
            <label className="check-row"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> <span>I saved my recovery key. I understand Nook cannot recover it, and losing it means losing old messages.</span></label>
          </>
        )}
        {adding && <p className="muted">Normally Nook looks after your key for you, so everything just works on every device. With your own passphrase only you can unlock it, and not even Nook could. The trade-off: if you forget it, old messages are gone for good.</p>}
        {mode === 'removepass' && <p className="muted">Nook will look after your key again, so you will not need to type anything. Enter your passphrase once to confirm it is you.</p>}
        {mode === 'unlock' && <p className="muted">Enter your passphrase to read and send direct messages on this device. You only need to do this once per device.</p>}
        {mode === 'reset' && <p className="muted"><strong>This cannot be undone.</strong> You get a brand new key. Messages sent to your old key can no longer be read, by anyone, and your friends will see that your safety number changed.</p>}
        {mode === 'change' && <p className="muted">Your key stays the same. Only the passphrase that protects its backup changes.</p>}

        {(needsCurrent || adding) && (
          <label>{mode === 'change' ? 'Current passphrase' : adding ? 'New passphrase' : 'Passphrase or recovery key'}
            <input ref={first} type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete={adding ? 'new-password' : 'current-password'} />
          </label>
        )}
        {adding && (
          <>
            <label>Type it again<input type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" /></label>
            <div className="strength" aria-hidden="true"><i className={`s${st}`} /></div>
            <label className="check-row"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> <span>I understand Nook cannot recover this passphrase. If I forget it, I will have to reset encryption and lose access to old messages.</span></label>
          </>
        )}
        {mode === 'change' && (
          <>
            <label>New passphrase<input type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" /></label>
            <label>Type the new one again<input type="password" value={c} onChange={(e) => setC(e.target.value)} autoComplete="new-password" /></label>
            <div className="strength" aria-hidden="true"><i className={`s${st}`} /></div>
          </>
        )}
        {err && <div className="error" role="alert">{err}</div>}
        {mode === 'unlock' && <button type="button" className="link" onClick={() => requestE2eeDialog('reset')}>I forgot my passphrase</button>}
        <div className="modal-foot enc-foot">
          <button type="button" className="ghost" onClick={onClose}>Not now</button>
          <button type="submit" className={mode === 'reset' ? 'danger-btn' : 'primary'} disabled={busy || (needsCurrent && !a) || (adding && !a) || (strict && !ok)}>{busy ? 'Working…' : strict ? 'Turn on full end-to-end' : mode === 'unlock' ? 'Unlock' : mode === 'change' ? 'Change passphrase' : mode === 'reset' ? 'Reset encryption' : mode === 'removepass' ? 'Use automatic' : 'Save passphrase'}</button>
        </div>
      </form>
    </Frame>
  )
}

/* Lives in the app shell and shows whichever encryption dialog was requested. */
export function E2eeHost({ me }) {
  const st = useE2ee()
  if (!st.dialog) return null
  return <E2eeDialog key={st.dialog} me={me} mode={st.dialog} onClose={() => requestE2eeDialog(null)} />
}

export function SafetyDialog({ name, safety, changed, onAccept, onClose }) {
  return (
    <Frame title={`Verify ${name}`} icon="lock" onClose={onClose} foot={<div className="modal-foot"><button className="primary" onClick={onClose}>Done</button></div>}>
      <p className="muted">To check that nobody is listening in, compare this number with {name} in person, on a call, or in another app. If it matches on both screens, your messages are private.</p>
      <div className="safety" aria-label="Safety number">{safety.map((g, i) => <span key={i}>{g}</span>)}</div>
      {changed && (
        <div className="info-box warn">
          <span>{name}'s number changed since you last chatted. They may have reset encryption or signed in on a new account. Check with them before sharing anything sensitive.</span>
          <button className="ghost small" onClick={onAccept}>I checked</button>
        </div>
      )}
    </Frame>
  )
}

/* Settings: your encryption, plus downloading your data. */
export function EncryptionPanel({ me }) {
  const st = useE2ee()
  const [busy, setBusy] = useState(false)
  const label = { loading: 'Checking…', none: 'Starting…', locked: 'Locked on this device', ready: 'Always on', unavailable: 'Not available yet', unsupported: 'Not supported in this browser' }[st.status]

  async function download() {
    setBusy(true)
    try {
      const data = await exportMyData(me.id)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `nook-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) {
      notify(e.message === 'Could not find the function' || /export_my_data/.test(e.message) ? 'Run update_v11.sql in Supabase first.' : e.message, 'error')
    }
    setBusy(false)
  }

  return (
    <>
      <div className="section">Encryption</div>
      <div className="enc-card">
        <span className={`enc-ico ${st.status === 'ready' ? 'on' : ''}`}><Icon name={st.status === 'ready' ? 'lock' : 'unlock'} size={18} /></span>
        <div className="grow">
          <strong>Direct messages: {label}</strong>
          <span className="muted tiny">Texts, photos, videos and voice notes in DMs are scrambled on your device whenever the other person has Nook open at least once since this arrived. Group chats and calls are protected in transit but are not end-to-end encrypted.</span>
        </div>
      </div>
      {!canCrypto && <p className="muted tiny">This browser does not support the encryption Nook needs. Try an up-to-date Chrome, Edge, Firefox or Safari over a secure connection.</p>}
      {st.status === 'unavailable' && <p className="muted tiny">Run <code>supabase/update_v13.sql</code> in Supabase to switch encryption on.</p>}
      {st.status === 'ready' && st.mode === 'auto' && <p className="muted tiny">Nothing to set up. Your key is looked after automatically and follows you to every device you sign in on. For the strongest privacy, switch to full end-to-end so that only you hold the key.</p>}
      {st.status === 'ready' && st.mode === 'passphrase' && <p className="muted tiny">Full end-to-end is on: you hold your key (a recovery key or your own passphrase). Nook cannot unlock your messages.</p>}
      <div className="row">
        {st.status === 'locked' && <button className="primary" onClick={() => requestE2eeDialog('unlock')}>Unlock on this device</button>}
        {st.status === 'ready' && st.mode === 'auto' && <button className="primary" onClick={() => requestE2eeDialog('strict')}><Icon name="shield" size={14} /> Switch to full end-to-end</button>}
        {st.status === 'ready' && st.mode === 'auto' && <button className="ghost" onClick={() => requestE2eeDialog('addpass')}><Icon name="key" size={14} /> Add my own passphrase</button>}
        {st.status === 'ready' && st.mode === 'passphrase' && (
          <>
            <button className="ghost" onClick={() => requestE2eeDialog('change')}>Change passphrase</button>
            <button className="ghost" onClick={() => requestE2eeDialog('removepass')}>Use automatic</button>
            <button className="ghost" onClick={async () => { if (await confirmDialog({ title: 'Lock this device?', body: 'Your key is removed from this browser. You will need your passphrase to read direct messages again.', confirmLabel: 'Lock' })) { await lockDevice(me.id); notify('Locked.') } }}>Lock this device</button>
          </>
        )}
        {(st.status === 'ready' || st.status === 'locked') && <button className="ghost danger" onClick={() => requestE2eeDialog('reset')}>Reset encryption</button>}
      </div>

      <div className="section">Your data</div>
      <p className="muted tiny">Download everything Nook holds about you as one file: your profile, friends, groups, reactions and the messages you wrote (direct messages are decrypted on your device first).</p>
      <div className="row"><button className="ghost" onClick={download} disabled={busy}><Icon name="download" size={15} /> {busy ? 'Preparing…' : 'Download my data'}</button></div>
      <p className="muted tiny">Read our <Link to="privacy">Privacy Policy</Link>, <Link to="terms">Terms of Service</Link> and <Link to="rules">Community Guidelines</Link>.</p>
    </>
  )
}
