import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { PAGES, ORDER } from '../legal/content.js'
import { LEGAL, TERMS_VERSION } from '../legal/config.js'
import { supabase } from '../supabase.js'

const hashPage = () => {
  const m = /^#\/(terms|privacy|rules|copyright|safety)$/.exec(window.location.hash)
  return m ? m[1] : null
}

/* A link that opens a legal page on top of whatever you are doing (a call keeps running). */
export function Link({ to, children }) {
  return <a href={`#/${to}`} className="legal-link">{children}</a>
}

function Block({ b }) {
  if (typeof b === 'string') return <p>{b}</p>
  return <ul>{b.ul.map((x, i) => <li key={i}>{x}</li>)}</ul>
}

/* Full-screen reader for the legal pages. Works signed in or out, and has its own address (#/terms and so on). */
export function LegalHost() {
  const [page, setPage] = useState(hashPage)
  useEffect(() => {
    const f = () => setPage(hashPage())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    if (!page) return undefined
    const k = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    document.title = `${PAGES[page].title} · Nook`
    return () => { window.removeEventListener('keydown', k); document.title = 'Nook' }
  }, [page])
  if (!page) return null
  const doc = PAGES[page]
  function close() {
    // Go back if we came from the app, otherwise just clear the address
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back()
    else window.location.hash = ''
    setTimeout(() => { if (hashPage()) { history.replaceState(null, '', window.location.pathname + window.location.search); setPage(null) } }, 60)
  }
  return (
    <div className="legal" role="dialog" aria-modal="true" aria-label={doc.title}>
      <div className="legal-top">
        <button className="ghost small" onClick={close}><Icon name="chevron" size={14} className="to-left" /> Back to Nook</button>
        <nav className="legal-nav" aria-label="Legal pages">
          {ORDER.map((id) => <a key={id} href={`#/${id}`} className={id === page ? 'on' : ''}>{PAGES[id].title}</a>)}
        </nav>
      </div>
      <article className="legal-body" key={page}>
        <h1>{doc.title}</h1>
        <p className="muted small">Last updated {LEGAL.updated}</p>
        <p className="lead">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.b.map((b, i) => <Block key={i} b={b} />)}
          </section>
        ))}
        <p className="muted small legal-foot">{LEGAL.company} · {LEGAL.product}</p>
      </article>
    </div>
  )
}

/* Shown to anyone who has not accepted the current terms (new accounts that skipped the sign-up box, and everyone when the terms change). */
export function TermsGate({ profile, user, onDone, onSignOut }) {
  const [age, setAge] = useState(Boolean(profile.age_confirmed))
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // People who ticked the box while signing up are not asked twice.
  const ticked = user?.user_metadata?.terms_version === TERMS_VERSION
  useEffect(() => {
    if (!ticked) return
    supabase.rpc('accept_terms', { ver: TERMS_VERSION }).then(({ error }) => { if (!error) onDone() })
  }, [ticked, onDone])
  if (ticked) return null
  async function accept() {
    setBusy(true)
    const { error } = await supabase.rpc('accept_terms', { ver: TERMS_VERSION })
    if (error) { setErr(error.message); setBusy(false); return }
    onDone()
  }
  return (
    <div className="overlay front">
      <div className="modal confirm terms-gate" role="dialog" aria-modal="true" aria-label="Terms and Privacy Policy">
        <div className="confirm-body">
          <span className="share-ico"><Icon name="shield" size={22} /></span>
          <h2>{profile.terms_version ? 'We updated our terms' : 'Before you jump in'}</h2>
          <p className="muted">Nook is a place for everyone, so we have clear rules and we protect your privacy. Please take a moment to look over:</p>
          <ul className="gate-links">
            <li><a href="#/terms" target="_blank" rel="noopener">Terms of Service</a><span className="muted tiny">How Nook works and what we each promise.</span></li>
            <li><a href="#/privacy" target="_blank" rel="noopener">Privacy Policy</a><span className="muted tiny">What we collect, why, and your choices. No ads, no selling data.</span></li>
            <li><a href="#/rules" target="_blank" rel="noopener">Community Guidelines</a><span className="muted tiny">Keeping Nook kind and safe.</span></li>
          </ul>
          <label className="check-row"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> <span>I am {LEGAL.minAge} or older (or have a parent or guardian's permission where the law needs it).</span></label>
          <label className="check-row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>I agree to the Terms of Service, Privacy Policy and Community Guidelines.</span></label>
          {err && <div className="error" role="alert">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="ghost" onClick={onSignOut}>Sign out</button>
          <button className="primary" disabled={!age || !agree || busy} onClick={accept}>{busy ? 'Saving…' : 'Agree and continue'}</button>
        </div>
      </div>
    </div>
  )
}

export function LegalLinks({ className = '' }) {
  return (
    <p className={`legal-links ${className}`}>
      <a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/rules">Guidelines</a><a href="#/copyright">Copyright</a><a href="#/safety">Safety</a>
    </p>
  )
}
