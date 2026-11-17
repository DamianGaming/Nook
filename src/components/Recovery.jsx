import { useState } from 'react'
import { supabase } from '../supabase.js'
import { Logo } from './Icon.jsx'

// Shown when someone arrives from a "reset password" email link
export default function Recovery({ onDone }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <div className="center-screen">
      <form className="card" onSubmit={submit}>
        <div className="logo"><Logo size={44} /></div>
        <h1>Choose a new password</h1>
        <label>
          New password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} autoComplete="new-password" autoFocus required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  )
}
