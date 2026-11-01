import { desktop } from '../desktop.js'
import Mascot from './Mascot.jsx'
import Icon, { Logo } from './Icon.jsx'
import { LegalLinks } from './Legal.jsx'
import { LEGAL } from '../legal/config.js'
import { notify } from '../dialog.jsx'

// Set VITE_GITHUB_REPO (owner/repo) and the button downloads the latest installer from your GitHub releases.
// Until then the button just says "coming soon".
const REPO = (import.meta.env.VITE_GITHUB_REPO || '').trim() // like "owner/repo"
const DESKTOP_URL = import.meta.env.VITE_DESKTOP_URL || (REPO ? `https://github.com/${REPO}/releases/latest/download/Nook-Setup.exe` : '')
const IN_DESKTOP = Boolean(desktop)

const FEATURES = [
  ['users', 'Groups that feel like home', 'Channels and categories you arrange by dragging. Give friends only the powers you want them to have, no roles to juggle.'],
  ['lock', 'Private by default', 'Direct messages and one-to-one calls are end-to-end encrypted automatically. Add a recovery key if you want only you to hold the key.'],
  ['headphones', 'Voice, video and screen sharing', 'Hop into a group voice channel in one click and see who is in it before you join. Share your screen in crisp quality.'],
  ['sparkle', 'Make it yours', 'Avatar frames, name colours and fonts, profile themes, badges, custom emoji for your group and an activity that shows what you are up to.'],
  ['shield', 'Safe for everyone', 'Reports, blocking, two-factor sign-in, clear rules and a staff team that looks after Nook. Built for ages 13 and up.'],
  ['leaf', 'Free, nothing to install', 'Open it in your browser on any device. No servers to set up, no ads, no selling your data.'],
]
const STEPS = [
  ['Make an account', 'Use your email. It takes under a minute.'],
  ['Add friends or join a group', 'Share a code or a username. Start chatting straight away.'],
  ['Talk, call and share', 'Messages, voice, video and screen sharing, all in one place.'],
]

/* The first page people see. */
export default function Landing({ onUseWeb, signedIn = false }) {
  const openLabel = signedIn ? 'Back to Nook' : IN_DESKTOP ? 'Sign in' : 'Use in web'
  return (
    <div className="landing">
      <header className="ld-nav">
        <a className="ld-brand" href="#/" onClick={(e) => e.preventDefault()}><Logo size={30} /><strong>Nook</strong></a>
        <nav aria-label="Page">
          <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }}>Features</a>
          <a href="#/safety">Safety</a>
          <a href="#/privacy">Privacy</a>
        </nav>
        <button className="primary small" onClick={onUseWeb}>{openLabel}</button>
      </header>

      <section className="ld-hero">
        <div className="ld-copy">
          <span className="ld-pill"><Icon name="leaf" size={13} /> Free and in your browser</span>
          <h1>A cozy place to talk with your people.</h1>
          <p>Nook is a simple chat space for friends and communities. Group chats with channels, private messages, voice, video and screen sharing, and plenty of ways to make it feel like yours.</p>
          <div className="ld-cta">
            <button className="primary big" onClick={onUseWeb}><Icon name="monitor" size={17} /> {signedIn || IN_DESKTOP ? 'Open Nook' : 'Use Nook in your browser'}</button>
            {!IN_DESKTOP && (DESKTOP_URL ? (
              <a className="ghost big ld-dl button-link" href={DESKTOP_URL} download><Icon name="download" size={17} /> Download for Windows</a>
            ) : (
              <button className="ghost big ld-dl" onClick={() => notify('The Windows app is coming soon. For now, use Nook in your browser.')} aria-label="Download for Windows, coming soon">
                <Icon name="download" size={17} /> Download for Windows <span className="ld-soon">Soon</span>
              </button>
            ))}
          </div>
          <p className="muted small ld-note">No download needed. Works on phones, tablets and computers.</p>
        </div>

        <div className="ld-art" aria-hidden="true">
          <div className="ld-window">
            <div className="ld-win-top"><span /><span /><span /><em># general</em></div>
            <div className="ld-chat">
              <div className="ld-msg"><i style={{ background: 'linear-gradient(135deg,#7c8cff,#c58cff)' }} /><div><b>Maya</b><p>Movie night in voice at 8?</p></div></div>
              <div className="ld-msg"><i style={{ background: 'linear-gradient(135deg,#ffb86b,#ff6b8a)' }} /><div><b>Jordan</b><p><span className="mention-chip me">@Maya</span> yes! Bringing snacks</p></div></div>
              <div className="ld-msg"><i style={{ background: 'linear-gradient(135deg,#4fd1c5,#7c8cff)' }} /><div><b>Sam</b><p>Screen sharing the trailer now</p></div></div>
              <div className="ld-voice"><Icon name="headphones" size={14} /> 3 in voice <span className="avatar-stack"><i style={{ background: '#7c8cff' }} /><i style={{ background: '#ffb86b' }} /><i style={{ background: '#4fd1c5' }} /></span></div>
            </div>
          </div>
          <div className="ld-mascot"><Mascot mood="happy" size={120} animated /></div>
        </div>
      </section>

      <section className="ld-section" id="features">
        <h2>Everything you need to hang out</h2>
        <div className="ld-grid">
          {FEATURES.map(([icon, title, text]) => (
            <article className="ld-card" key={title}>
              <span className="ld-ico"><Icon name={icon} size={20} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ld-section ld-steps">
        <h2>Up and running in minutes</h2>
        <ol>
          {STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}
        </ol>
        <button className="primary big" onClick={onUseWeb}>{signedIn ? 'Open Nook' : 'Get started'}</button>
      </section>

      <footer className="ld-foot">
        <div className="ld-foot-brand"><Logo size={22} /><span>{LEGAL.product} by {LEGAL.company}</span></div>
        <LegalLinks />
      </footer>
    </div>
  )
}
