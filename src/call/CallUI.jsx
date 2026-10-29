import { Suspense, lazy, memo, useEffect, useRef, useState } from 'react'
import { useMusic, setMusic } from '../music/store.js'
import Avatar from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import Mascot from '../components/Mascot.jsx'
import { useCall } from './CallProvider.jsx'
import { usePrefs, setPrefs } from '../prefs.js'
import { loop } from '../sounds.js'
import { notify } from '../dialog.jsx'
import { VoiceSettings } from '../lazyModals.js'

function VideoEl({ track, mirror, contain }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    track.attach(el)
    return () => { track.detach(el) }
  }, [track])
  return <video ref={ref} className={`tile-video ${mirror ? 'mirror' : ''} ${contain ? 'contain' : ''}`} autoPlay playsInline muted />
}

/* Your own shared screen is not shown back to you (it would mirror itself), just a calm reminder. */
function SelfShare({ small }) {
  const c = useCall()
  return (
    <div className="self-share">
      <Icon name="monitor" size={small ? 22 : 34} />
      {!small && <strong>You are sharing your screen</strong>}
      {!small && <button className="ghost small" onClick={(e) => { e.stopPropagation(); c.stopScreen() }}>Stop sharing</button>}
    </div>
  )
}

const pipOk = typeof document !== 'undefined' && document.pictureInPictureEnabled

const Tile = memo(function Tile({ p, kind = 'cam', small, onPick }) {
  const c = useCall()
  const [fill, setFill] = useState(false)
  const track = kind === 'screen' ? p.screen : p.cam
  const box = useRef(null)
  const profile = { id: p.id, username: p.name, display_name: p.name, avatar_url: p.meta?.a, accent_color: p.meta?.c, frame: p.meta?.f, frame_color: p.meta?.fc, name_color2: p.meta?.n2, name_font: p.meta?.nf }
  const label = kind === 'screen' ? (p.isLocal ? 'Your screen' : `${p.name}'s screen`) : p.isLocal ? `${p.name} (you)` : p.name
  const remoteShare = kind === 'screen' && !p.isLocal
  return (
    <div ref={box} className={`tile ${p.speaking && kind === 'cam' ? 'speaking' : ''}`} onClick={onPick} role={onPick ? 'button' : undefined}>
      {kind === 'screen' && p.isLocal ? (
        <SelfShare small={small} />
      ) : remoteShare && !p.watching ? (
        <div className="self-share">
          <Icon name="monitor" size={small ? 22 : 34} />
          {!small && <strong>You paused {p.name}'s screen</strong>}
          {!small && <button className="primary small" onClick={(e) => { e.stopPropagation(); c.watchScreen(p.id, true) }}>Watch again</button>}
        </div>
      ) : track ? (
        <VideoEl track={track} mirror={p.isLocal && kind === 'cam'} contain={kind === 'screen' && !fill} />
      ) : remoteShare ? (
        <div className="self-share"><span className="spinner" aria-hidden="true" />{!small && <strong>Connecting to the screen…</strong>}</div>
      ) : (
        <div className="tile-avatar"><Avatar profile={profile} size={small ? 40 : 84} /></div>
      )}
      {kind === 'cam' && p.quality != null && !small && <span className={`q-bars q${p.quality}`} title={['Connection lost', 'Poor connection', 'Good connection', 'Excellent connection'][p.quality]}><i /><i /><i /></span>}
      <div className="tile-name">
        {kind === 'cam' && p.deaf && <Icon name="headphonesoff" size={12} />}
        {kind === 'cam' && !p.mic && !p.deaf && <Icon name="micoff" size={12} />}
        <span className="ellipsis">{label}</span>
      </div>
      {remoteShare && p.watching && <span className="live-pill">LIVE</span>}
      {remoteShare && !small && (
        <div className="tile-tools">
          {p.watching && <button className="icon-btn" title={fill ? 'Fit whole screen' : 'Fill the tile'} aria-label={fill ? 'Fit whole screen' : 'Fill the tile'} onClick={(e) => { e.stopPropagation(); setFill((f) => !f) }}><Icon name={fill ? 'minimize' : 'maximize'} size={16} /></button>}
          {p.watching && pipOk && <button className="icon-btn" title="Pop out (keep watching in another tab)" aria-label="Pop out" onClick={(e) => { e.stopPropagation(); box.current?.querySelector('video')?.requestPictureInPicture?.().catch(() => {}) }}><Icon name="popout" size={16} /></button>}
          {p.watching && <button className="icon-btn" title="Full screen" aria-label="Full screen" onClick={(e) => { e.stopPropagation(); box.current?.requestFullscreen?.() }}><Icon name="monitor" size={16} /></button>}
          <button className="icon-btn" title={p.watching ? 'Stop watching (saves data)' : 'Watch'} aria-label={p.watching ? 'Stop watching' : 'Watch'} onClick={(e) => { e.stopPropagation(); c.watchScreen(p.id, !p.watching) }}><Icon name={p.watching ? 'monitoroff' : 'play'} size={16} /></button>
        </div>
      )}
    </div>
  )
})

const MusicLayer = lazy(() => import('../music/MusicLayer.jsx'))

function Ctrl({ on, offIcon, onIcon, label, onClick, tone }) {
  return (
    <button className={`ctrl ${tone || (on ? 'on' : 'off')}`} onClick={onClick} title={label} aria-label={label} aria-pressed={on}>
      <Icon name={on ? onIcon : offIcon} size={18} />
    </button>
  )
}

function Controls() {
  const c = useCall()
  const music = useMusic()
  return (
    <>
      <Ctrl on={c.local.mic} onIcon="mic" offIcon="micoff" label={c.local.mic ? 'Mute' : 'Unmute'} onClick={c.toggleMic} />
      <Ctrl on={!c.deaf} onIcon="headphones" offIcon="headphonesoff" label={c.deaf ? 'Undeafen' : 'Deafen'} onClick={c.toggleDeaf} tone={c.deaf ? 'off' : 'plain'} />
      <Ctrl on={c.local.cam} onIcon="video" offIcon="videooff" label={c.local.cam ? 'Turn camera off' : 'Turn camera on'} onClick={c.toggleCam} tone={c.local.cam ? 'on' : 'plain'} />
      {c.canScreen && (
        <span className="ctrl-split">
          <Ctrl on={c.local.screen} onIcon="monitor" offIcon="monitor" label={c.local.screen ? 'Stop sharing' : 'Share your screen'} onClick={c.toggleScreen} tone={c.local.screen ? 'on' : 'plain'} />
          {!c.local.screen && <button className="ctrl-opt" onClick={c.openShare} title="Screen share options" aria-label="Screen share options"><Icon name="chevron" size={12} /></button>}
        </span>
      )}
      <button className={`ctrl ${music.open ? 'on' : 'plain'}`} onClick={() => setMusic({ open: !music.open })} title="Music" aria-label="Music" aria-pressed={music.open}><Icon name="music" size={18} /></button>
      <button className="ctrl plain" onClick={c.openSettings} title="Voice and video settings" aria-label="Voice and video settings"><Icon name="settings" size={18} /></button>
      <button className="ctrl leave" onClick={c.leave} title="Leave call" aria-label="Leave call"><Icon name="phoneoff" size={18} /></button>
    </>
  )
}

/* Header buttons: start, or leave, or jump back to the call you are already in. */
export function CallButtons({ spec, onOpen }) {
  const c = useCall()
  if (!spec) return null
  if (c.active?.key === spec.key) {
    return <button className="ghost small danger" onClick={c.leave}><Icon name="phoneoff" size={15} /> Leave</button>
  }
  if (c.active) {
    return <button className="ghost small" onClick={() => onOpen?.(c.active)}><span className="pulse connected" /> In a call</button>
  }
  return (
    <>
      <button className="icon-btn" title={spec.kind === 'dm' ? 'Start a voice call' : 'Join the group voice'} aria-label="Voice call" onClick={() => c.join(spec)}><Icon name="phone" size={17} /></button>
      <button className="icon-btn" title="Start with camera" aria-label="Video call" onClick={() => c.join(spec, { cam: true })}><Icon name="video" size={17} /></button>
      {c.canScreen && (
        <button className="icon-btn" title="Share your screen" aria-label="Share your screen" onClick={() => c.join(spec, { screen: true })}><Icon name="monitor" size={17} /></button>
      )}
    </>
  )
}

/* Compact bar in the sidebar, visible wherever you are in the app while in a call. */
export function CallBar({ onOpen }) {
  const c = useCall()
  const music = useMusic()
  if (!c.active) return null
  const label = c.status === 'connected' ? 'Connected' : c.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  const mini = (on, onIcon, offIcon, text, fn, plain) => (
    <button className={`icon-btn ${on || plain ? '' : 'off'}`} onClick={fn} title={text} aria-label={text}><Icon name={on ? onIcon : offIcon} size={16} /></button>
  )
  return (
    <div className="callbar">
      <button className="callbar-info" onClick={() => onOpen?.(c.active)} title="Open call">
        <span className={`pulse ${c.status}`} />
        <span className="callbar-text">
          <strong>{label}{c.ping != null && c.status === 'connected' && <span className={`ping inline ${c.ping > 250 ? 'bad' : c.ping > 120 ? 'mid' : ''}`}>{c.ping} ms</span>}</strong>
          <span className="muted tiny ellipsis">{c.secure && <Icon name="lock" size={10} />} {c.active.title}</span>
        </span>
      </button>
      <div className="callbar-ctrls">
        {mini(c.local.mic, 'mic', 'micoff', c.local.mic ? 'Mute' : 'Unmute', c.toggleMic)}
        {mini(!c.deaf, 'headphones', 'headphonesoff', c.deaf ? 'Undeafen' : 'Deafen', c.toggleDeaf)}
        {mini(c.local.cam, 'video', 'videooff', c.local.cam ? 'Turn camera off' : 'Turn camera on', c.toggleCam, true)}
        {c.canScreen && mini(c.local.screen, 'monitoroff', 'monitor', c.local.screen ? 'Stop sharing' : 'Share your screen', c.toggleScreen, true)}
        <button className={`icon-btn ${music.open ? 'on' : ''}`} onClick={() => setMusic({ open: !music.open })} title="Music" aria-label="Music" aria-pressed={music.open}><Icon name="music" size={16} /></button>
        <button className="icon-btn" onClick={c.openSettings} title="Voice and video settings" aria-label="Voice and video settings"><Icon name="settings" size={16} /></button>
        <button className="icon-btn leave" onClick={c.leave} title="Leave call" aria-label="Leave call"><Icon name="phoneoff" size={16} /></button>
      </div>
    </div>
  )
}

/* The call itself: everyone's tile, or one big shared screen with everyone in a strip below. */
export function CallStage() {
  const c = useCall()
  const [min, setMin] = useState(false)
  const [pin, setPin] = useState(null) // "id:cam" or "id:screen"
  const { parts, active } = c

  if (!active) return null
  const count = parts.length

  if (min) {
    return (
      <div className="stage-min">
        <span className={`pulse ${c.status}`} />
        <strong className="ellipsis">{active.title}</strong>
        <span className="muted small">{count} in call</span>
        <span className="spacer" />
        <div className="stage-controls inline"><Controls /></div>
        <button className="icon-btn" onClick={() => setMin(false)} title="Show call" aria-label="Show call"><Icon name="maximize" size={16} /></button>
      </div>
    )
  }

  const all = parts.flatMap((p) => [{ id: `${p.id}:cam`, p, kind: 'cam' }, ...(p.screen ? [{ id: `${p.id}:screen`, p, kind: 'screen' }] : [])])
  const firstScreen = all.find((t) => t.kind === 'screen')
  const main = all.find((t) => t.id === pin) || firstScreen
  const focus = Boolean(main && (main.kind === 'screen' || pin))
  const rest = all.filter((t) => t !== main && t.kind === 'cam')
  const pick = (t) => () => setPin((cur) => (cur === t.id ? null : t.id))
  const waiting = count <= 1

  return (
    <section className={`stage ${focus ? 'focus' : ''}`} aria-label="Call">
      <div className="stage-top">
        <span className={`pulse ${c.status}`} />
        <strong className="ellipsis">{active.title}</strong>
        <span>{count} in call{c.status === 'reconnecting' ? ' · reconnecting…' : ''}</span>
        {c.ping != null && <span className={`ping ${c.ping > 250 ? 'bad' : c.ping > 120 ? 'mid' : ''}`} title="Round trip to the call server. Lower is better.">{c.ping} ms</span>}
        {active.kind === 'dm' && <span className={`call-lock ${c.secure ? 'on' : ''}`} title={c.secure ? 'Voice, video and screen sharing in this call are end-to-end encrypted' : 'Not end-to-end encrypted: one of you has no encryption key yet'}><Icon name={c.secure ? 'lock' : 'unlock'} size={12} /> {c.secure ? 'End-to-end encrypted' : 'Not end-to-end encrypted'}</span>}
        <button className="icon-btn spacer" onClick={() => setMin(true)} title="Minimise call" aria-label="Minimise call"><Icon name="minimize" size={16} /></button>
      </div>

      {focus ? (
        <div className="stage-body focus">
          <div className="stage-main"><Tile p={main.p} kind={main.kind} onPick={pick(main)} /></div>
          {rest.length > 0 && (
            <div className="stage-strip">{rest.map((t) => <Tile key={t.id} p={t.p} kind={t.kind} small onPick={pick(t)} />)}</div>
          )}
        </div>
      ) : (
        <div className="stage-body">
          <div className="stage-grid">
            {all.map((t) => <Tile key={t.id} p={t.p} kind={t.kind} onPick={pick(t)} />)}
            {waiting && (
              <div className="tile tile-wait">
                <Mascot mood={c.ringing ? 'wave' : 'sleepy'} size={72} animated />
                <span>{c.ringing ? `Ringing ${active.title}…` : 'Waiting for others to join…'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="stage-controls"><Controls /></div>
    </section>
  )
}

/* Asks how to share before the browser's own picker opens (the browser always chooses the window or screen itself). */
function ShareDialog({ onStart, onClose }) {
  const p = usePrefs()
  const opts = [
    ['light', 'Light', '720p, easy on slow connections and older computers'],
    ['balanced', 'Balanced', '720p, smooth motion'],
    ['sharp', 'Sharp', '1080p, smooth motion'],
    ['detail', 'Detail', '1080p, best for text and slides'],
  ]
  return (
    <div className="overlay front" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm share" role="dialog" aria-modal="true" aria-label="Share your screen">
        <div className="confirm-body">
          <span className="share-ico"><Icon name="monitor" size={22} /></span>
          <h2>Share your screen</h2>
          <p className="muted">Pick a quality. Next, your browser asks which window, screen or tab to share (that part is always the browser's own).</p>
          <div className="choice-list" role="radiogroup" aria-label="Quality">
            {opts.map(([id, name, hint]) => (
              <button type="button" key={id} role="radio" aria-checked={p.shareQuality === id} className={`choice ${p.shareQuality === id ? 'on' : ''}`} onClick={() => setPrefs({ shareQuality: id })}>
                <strong>{name}</strong><span className="muted tiny">{hint}</span>
              </button>
            ))}
          </div>
          <label className="switch-row">
            <span>Share sound too<span className="muted tiny">Works for tabs, and for screens in some browsers.</span></span>
            <input type="checkbox" className="switch" checked={p.shareAudio} onChange={(e) => setPrefs({ shareAudio: e.target.checked })} />
          </label>
        </div>
        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={onStart} autoFocus>Start sharing</button>
        </div>
      </div>
    </div>
  )
}

/* Incoming call card, share dialog, voice settings, and short messages (shown as toasts). */
function MiniStream({ onOpen }) {
  const c = useCall()
  const [closed, setClosed] = useState(null)
  const shared = c.parts.find((p) => !p.isLocal && p.screen)
  if (!shared || closed === shared.id) return null
  return (
    <div className="mini-stream" role="region" aria-label={`${shared.name} is sharing their screen`}>
      <div className="mini-video"><VideoEl track={shared.screen} contain /></div>
      <div className="mini-bar">
        <span className="live-pill static">LIVE</span>
        <span className="ellipsis">{shared.name}</span>
        <button className="icon-btn" onClick={() => onOpen?.(c.active)} title="Open call" aria-label="Open call"><Icon name="maximize" size={14} /></button>
        <button className="icon-btn" onClick={() => setClosed(shared.id)} title="Hide" aria-label="Hide"><Icon name="x" size={14} /></button>
      </div>
    </div>
  )
}

export function CallOverlays({ inRoom, onOpen }) {
  const c = useCall()
  useEffect(() => (c.incoming ? loop('ring', 2200, { force: true }) : undefined), [c.incoming])
  useEffect(() => { if (c.toast) notify(c.toast.text, c.toast.kind === 'error' ? 'error' : 'info') }, [c.toast])
  const who = c.incoming?.caller
  const name = who?.display_name || who?.username || 'Someone'
  return (
    <>
      {c.incoming && (
        <div className="incoming" role="alertdialog" aria-label={`Incoming call from ${name}`}>
          <span className="incoming-av"><Avatar profile={who} size={44} /></span>
          <div className="incoming-text">
            <strong className="ellipsis">{name}</strong>
            <span className="muted small">Incoming call</span>
          </div>
          <button className="ctrl decline" onClick={c.decline} aria-label="Decline" title="Decline"><Icon name="phoneoff" size={18} /></button>
          <button className="ctrl accept" onClick={c.accept} aria-label="Accept" title="Accept"><Icon name="phone" size={18} /></button>
        </div>
      )}
      {c.local.screen && (
        <div className="share-banner" role="status">
          <Icon name="monitor" size={15} />
          <span>You are sharing your screen</span>
          <button className="ghost small" onClick={c.stopScreen}>Stop sharing</button>
        </div>
      )}
      {c.active && !inRoom && <MiniStream onOpen={onOpen} />}
      {c.shareOpen && <ShareDialog onStart={c.startScreen} onClose={c.closeShare} />}
      {c.active && <Suspense fallback={null}><MusicLayer /></Suspense>}
      <Suspense fallback={null}>{c.settingsOpen && <VoiceSettings onClose={c.closeSettings} />}</Suspense>
    </>
  )
}
