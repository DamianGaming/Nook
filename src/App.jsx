import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { supabase, configured } from './supabase.js'
import { Logo } from './components/Icon.jsx'
import Mascot from './components/Mascot.jsx'
import { CallProvider } from './call/CallProvider.jsx'
import { DialogHost } from './dialog.jsx'
import { ContextMenuHost } from './contextmenu.jsx'
import { PresenceProvider } from './presence.jsx'
import { desktop } from './desktop.js'
import { LegalHost, TermsGate } from './components/Legal.jsx'
import { TERMS_VERSION } from './legal/config.js'

// Each screen loads only when it is needed, so the first paint stays small.
const Auth = lazy(() => import('./components/Auth.jsx'))
const Shell = lazy(() => import('./components/Shell.jsx'))
const Landing = lazy(() => import('./components/Landing.jsx'))
const Recovery = lazy(() => import('./components/Recovery.jsx'))
// Someone who is probably signed in gets the chat code fetched in parallel with the session check.
try {
  if (Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))) import('./components/Shell.jsx')
} catch { /* storage blocked */ }
const MfaGate = lazy(() => import('./components/TwoFactor.jsx').then((m) => ({ default: m.MfaGate })))

function Boot({ text }) {
  return (
    <div className="center-screen">
      <div className="boot">
        <div className="hop"><Mascot mood="happy" size={96} animated /></div>
        {text && <p className="muted boot-text">{text}<i className="dots"><b /><b /><b /></i></p>}
      </div>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="center-screen">
      <div className="card">
        <div className="logo"><Logo size={44} /></div>
        <h1>Almost there</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, add your Supabase URL and anon key, run{' '}
          <code>supabase/schema.sql</code> in the Supabase SQL editor, then restart the dev server.
        </p>
      </div>
    </div>
  )
}

function AppInner() {
  const [session, setSession] = useState(undefined)
  const [entered, setEntered] = useState(() => Boolean(desktop) || window.location.hash === '#/login')
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('idle') // idle | loading | ready | failed
  const [failMsg, setFailMsg] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async () => {
    if (!session) {
      setProfile(null)
      setState('idle')
      return
    }
    setState((cur) => (cur === 'ready' ? cur : 'loading')) // a refresh (new status, edited profile) must not blank the app
    const user = session.user
    let { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!data && !error) {
      // Fallback: create it here if the database trigger hasn't
      const base = (user.user_metadata?.username || user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16).padEnd(3, '0')
      for (let i = 0; i < 5 && !data; i++) {
        const name = i === 0 ? base : base + Math.floor(Math.random() * 900 + 100)
        const res = await supabase.from('profiles').insert({ id: user.id, username: name, display_name: name }).select().maybeSingle()
        if (res.data) data = res.data
        else error = res.error
        if (res.error && res.error.code !== '23505') break
      }
    }
    if (data) {
      setProfile(data)
      setState('ready')
    } else {
      setFailMsg(error?.message || 'Could not create your profile.')
      setState('failed')
    }
  }, [session])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // People with two-factor on must enter a code after the password, once per sign-in.
  const [aal, setAal] = useState('checking') // checking | ok | need
  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setAal('checking'); return undefined }
    let live = true
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (!live) return
      setAal(!error && data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'need' : 'ok')
    }, () => live && setAal('ok'))
    return () => { live = false }
  }, [uid])

  const [home, setHome] = useState(() => !desktop && window.location.hash === '#/home')
  useEffect(() => {
    const f = () => setHome(!desktop && window.location.hash === '#/home')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  if (!configured) return <SetupNotice />
  if (session === undefined) return <Boot />
  if (!session) return entered ? <Auth onBack={desktop ? undefined : () => { window.location.hash = ''; setEntered(false) }} /> : <Landing onUseWeb={() => { window.location.hash = '#/login'; setEntered(true) }} />
  if (session && aal === 'need') return <MfaGate onDone={() => setAal('ok')} onSignOut={() => supabase.auth.signOut()} />
  if (session && aal === 'checking') return <Boot />
  if (recovering) return <Recovery onDone={() => setRecovering(false)} />
  if (state === 'failed') {
    return (
      <div className="center-screen">
        <div className="card">
          <div className="mascot-hero"><Mascot mood="oops" size={84} animated /></div>
          <h1>Profile setup hit a snag</h1>
          <p className="muted">{failMsg}</p>
          <p className="muted small">Make sure you ran <code>schema.sql</code> and <code>fix_profiles.sql</code> in Supabase.</p>
          <button className="primary" onClick={loadProfile}>Try again</button>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  if (state !== 'ready' || !profile) return <Boot text="Getting your nook ready" />
  // The gate only applies once update_v11.sql has added the column.
  const needsTerms = 'terms_version' in profile && profile.terms_version !== TERMS_VERSION && !accepted
  return (
    <PresenceProvider userId={session.user.id} status={profile.status}>
      <CallProvider me={session.user}>
        <Shell session={session} profile={profile} reloadProfile={loadProfile} />
        {/* Shown on top so a running call keeps going while you read the home page. */}
        {home && <div className="home-over"><Landing signedIn onUseWeb={() => { window.location.hash = '' }} /></div>}
      </CallProvider>
      {needsTerms && <TermsGate profile={profile} user={session.user} onDone={() => { setAccepted(true); loadProfile() }} onSignOut={() => supabase.auth.signOut()} />}
    </PresenceProvider>
  )
}

export default function App() {
  return (
    <>
      <Suspense fallback={<Boot />}><AppInner /></Suspense>
      <LegalHost />
      <DialogHost />
      <ContextMenuHost />
    </>
  )
}
