import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { getPrefs, usePrefs } from '../prefs.js'
import { play, loop } from '../sounds.js'

// Owns the one active call: connecting, tracks, mic/camera/screen, ringing a DM, and the "who is in this voice channel" heartbeat.
// livekit-client is only downloaded when someone actually starts or joins a call.

const Ctx = createContext(null)
export const useCall = () => useContext(Ctx)

import { callSecret } from '../e2ee.js'
const NO_LOCAL = { mic: false, cam: false, screen: false }
const RING_MS = 45000
const BEAT_MS = 25000

// Phones and tablets cannot share their screen from a browser, so hide the button there.
export const canShareScreen =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

async function readError(err) {
  try {
    if (err?.context?.status === 404) return 'Calls are not set up yet. See CALLS_SETUP.md.'
    if (err?.context?.json) {
      const body = await err.context.json()
      if (body?.error) return body.error
    }
  } catch { /* fall through */ }
  if (err?.name === 'FunctionsFetchError') return 'Could not reach the calls service. Check your connection.'
  return err?.message || 'Could not start the call.'
}

const withTimeout = (promise, ms, message) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms))])

function mediaMessage(e) {
  const n = e?.name || e?.error?.name
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'Permission blocked. Allow microphone and camera access in your browser settings.'
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return 'No microphone or camera found.'
  if (n === 'NotReadableError') return 'Your microphone or camera is being used by another app.'
  return 'Could not access your microphone or camera.'
}

function snapshot(room, lk) {
  const { Track } = lk
  const people = [room.localParticipant, ...room.remoteParticipants.values()]
  return people.map((p) => {
    let meta = {}
    try { meta = JSON.parse(p.metadata || '{}') } catch { /* ignore */ }
    const cam = p.getTrackPublication(Track.Source.Camera)
    const scr = p.getTrackPublication(Track.Source.ScreenShare)
    const mic = p.getTrackPublication(Track.Source.Microphone)
    return {
      id: p.identity,
      name: p.name || 'Someone',
      isLocal: p.isLocal,
      speaking: p.isSpeaking,
      deaf: p.attributes?.deaf === '1',
      mic: Boolean(mic) && !mic.isMuted,
      cam: cam?.track && !cam.isMuted ? cam.track : null,
      screen: scr?.track || null,
      quality: p.connectionQuality === 'excellent' ? 3 : p.connectionQuality === 'good' ? 2 : p.connectionQuality === 'poor' ? 1 : p.connectionQuality === 'lost' ? 0 : null,
      hasScreen: Boolean(scr),
      watching: scr ? (p.isLocal || scr.isSubscribed !== false) : false,
      raw: p.metadata || '',
      meta,
    }
  })
}

export function CallProvider({ me, children }) {
  const [active, setActive] = useState(null) // { key, kind, id, title, groupId?, otherId?, navigate? }
  const [status, setStatus] = useState('idle') // idle | connecting | connected | reconnecting
  const [parts, setParts] = useState([])
  const [local, setLocal] = useState(NO_LOCAL)
  const [ringing, setRinging] = useState(false)
  const [incoming, setIncoming] = useState(null)
  const [toast, setToast] = useState(null)
  const [deaf, setDeaf] = useState(false)
  const [ping, setPing] = useState(null) // round trip to the call server, in ms
  const [secure, setSecure] = useState(false) // is this call end-to-end encrypted
  const workerRef = useRef(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const prefs = usePrefs()

  const roomRef = useRef(null)
  const lkRef = useRef(null)
  const audioBox = useRef(null)
  const inviteRef = useRef(null)
  const beatRef = useRef(null)
  const activeRef = useRef(null)
  const seqRef = useRef(0)
  const statusRef = useRef('idle')
  const optsRef = useRef({})
  const deafRef = useRef(false)
  const micBeforeDeaf = useRef(true)
  const rejoinRef = useRef({ n: 0, at: 0 })
  activeRef.current = active
  statusRef.current = status

  const say = useCallback((kind, text) => setToast({ kind, text, id: Date.now() }), [])
  const dismissToast = useCallback(() => setToast(null), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6500)
    return () => clearTimeout(t)
  }, [toast])

  const refresh = useCallback(() => {
    const room = roomRef.current
    const lk = lkRef.current
    if (!room || !lk) return
    const lp = room.localParticipant
    // Reuse the previous object for anyone who did not change, so tiles that did not change do not re-render.
    const next = snapshot(room, lk)
    setParts((prev) => {
      const old = new Map(prev.map((x) => [x.id, x]))
      let same = prev.length === next.length
      const merged = next.map((n, i) => {
        const o = old.get(n.id)
        const eq = o && Object.keys(n).every((k) => k === 'meta' || o[k] === n[k])
        if (!eq || prev[i] !== o) same = false
        return eq ? o : n
      })
      return same ? prev : merged
    })
    setLocal((cur) => (cur.mic === lp.isMicrophoneEnabled && cur.cam === lp.isCameraEnabled && cur.screen === lp.isScreenShareEnabled ? cur : { mic: lp.isMicrophoneEnabled, cam: lp.isCameraEnabled, screen: lp.isScreenShareEnabled }))
  }, [])

  /* ---- voice channel heartbeat ---- */
  const stopBeat = useCallback(() => {
    const b = beatRef.current
    if (!b) return
    clearInterval(b.timer)
    beatRef.current = null
    supabase.from('group_voice').delete().eq('group_id', b.groupId).eq('user_id', me.id).then(() => {}, () => {})
  }, [me.id])

  const startBeat = useCallback((groupId) => {
    const beat = () => supabase.from('group_voice').upsert({ group_id: groupId, user_id: me.id }).then(() => {}, () => {})
    beat()
    beatRef.current = { groupId, timer: setInterval(beat, BEAT_MS) }
  }, [me.id])

  /* ---- DM ringing (caller side) ---- */
  const endInvite = useCallback((status = 'cancelled') => {
    const id = inviteRef.current
    inviteRef.current = null
    setRinging(false)
    if (id) supabase.from('call_invites').update({ status }).eq('id', id).eq('status', 'ringing').then(() => {}, () => {})
  }, [])

  // Drops the connection but keeps the call "open" in the UI, used when quietly rejoining.
  const teardownRoom = useCallback(async () => {
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      try { await room.disconnect() } catch { /* already gone */ }
    }
    audioBox.current?.replaceChildren()
    try { workerRef.current?.terminate() } catch { /* ignore */ }
    workerRef.current = null
  }, [])

  const cleanup = useCallback(async () => {
    seqRef.current += 1
    stopBeat()
    endInvite()
    await teardownRoom()
    deafRef.current = false
    setDeaf(false)
    setShareOpen(false)
    setActive(null)
    setStatus('idle')
    setParts([])
    setLocal(NO_LOCAL)
  }, [stopBeat, endInvite, teardownRoom])

  const leave = useCallback(() => { if (activeRef.current) play('leave'); return cleanup() }, [cleanup])

  const join = useCallback(async (spec, opts = {}) => {
    const quiet = Boolean(opts.rejoin)
    if (!quiet && activeRef.current?.key === spec.key && (roomRef.current || statusRef.current === 'connecting')) return
    if (!quiet && (roomRef.current || activeRef.current)) await cleanup()
    if (quiet) await teardownRoom()
    const seq = ++seqRef.current
    if (!quiet) optsRef.current = { spec, mic: true, cam: Boolean(opts.cam) }
    setActive(spec)
    setStatus(quiet ? 'reconnecting' : 'connecting')
    try {
      // One quiet retry covers a cold start of the token function or a brief network blip.
      const getToken = () => withTimeout(supabase.functions.invoke('livekit-token', { body: { kind: spec.kind, id: spec.id } }), 12000, 'The calls service is slow to answer. Try again.')
      let { data, error } = await getToken().catch((e) => ({ data: null, error: e }))
      if (error && !error?.context?.status) ({ data, error } = await getToken().catch((e) => ({ data: null, error: e })))
      if (error) throw new Error(error.message && !error.context ? error.message : await readError(error))
      if (!data?.token) throw new Error(data?.error || 'Could not start the call.')
      const lk = lkRef.current || (lkRef.current = await import('livekit-client'))
      if (seq !== seqRef.current) return

      // Calls between two people are end-to-end encrypted when both have encryption keys (like Discord's voice and video).
      let provider = null
      if (spec.kind === 'dm' && spec.otherId && lk.isE2EESupported?.()) {
        try {
          const sec = await callSecret(spec.id, spec.otherId)
          if (sec) {
            provider = new lk.ExternalE2EEKeyProvider()
            await provider.setKey(sec)
            workerRef.current = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' })
          }
        } catch { provider = null }
      }
      if (seq !== seqRef.current) return
      const pf = getPrefs()
      const room = new lk.Room({
        ...(provider ? { e2ee: { keyProvider: provider, worker: workerRef.current } } : {}),
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          deviceId: pf.inputId || undefined,
          echoCancellation: pf.echo,
          noiseSuppression: pf.noise,
          autoGainControl: pf.agc,
        },
        videoCaptureDefaults: { deviceId: pf.camId || undefined, resolution: lk.VideoPresets.h540.resolution },
        audioOutput: { deviceId: pf.outputId || undefined },
        publishDefaults: { dtx: true, red: true, simulcast: true },
      })
      roomRef.current = room

      const E = lk.RoomEvent
      const onChange = () => { if (roomRef.current === room) refresh() }
      ;[
        E.ParticipantConnected, E.ParticipantDisconnected, E.TrackSubscribed, E.TrackUnsubscribed, E.TrackMuted,
        E.TrackUnmuted, E.ConnectionQualityChanged, E.LocalTrackPublished, E.LocalTrackUnpublished, E.ActiveSpeakersChanged, E.ParticipantAttributesChanged,
      ].forEach((ev) => room.on(ev, onChange))
      room.on(E.ParticipantConnected, () => { if (roomRef.current === room) play('peerJoin') })
      room.on(E.ParticipantDisconnected, () => { if (roomRef.current === room) play('peerLeave') })
      room.on(E.TrackSubscribed, (track) => {
        if (track.kind === 'audio') {
          const el = track.attach()
          el.muted = deafRef.current
          el.volume = getPrefs().outVolume
          audioBox.current?.appendChild(el)
        }
      })
      room.on(E.TrackUnsubscribed, (track) => {
        if (track.kind === 'audio') track.detach().forEach((el) => el.remove())
      })
      room.on(E.Reconnecting, () => { if (roomRef.current === room) setStatus('reconnecting') })
      room.on(E.Reconnected, () => { if (roomRef.current === room) { setStatus('connected'); refresh() } })
      room.on(E.MediaDevicesError, (e) => say('error', mediaMessage(e)))
      room.on(E.Disconnected, (reason) => {
        if (roomRef.current !== room) return
        const R = lk.DisconnectReason
        if (reason === R.CLIENT_INITIATED) return
        if (reason === R.DUPLICATE_IDENTITY) { say('info', 'You joined this call from another tab or device.'); cleanup(); return }
        if (reason === R.PARTICIPANT_REMOVED || reason === R.ROOM_DELETED) { say('info', 'The call ended.'); play('leave'); cleanup(); return }
        // Anything else (a sleeping tab, a network drop) is not the person's choice: get back in quietly.
        const r = rejoinRef.current
        if (Date.now() - r.at > 120000) r.n = 0
        r.at = Date.now()
        if (r.n < 4 && activeRef.current) {
          r.n += 1
          setTimeout(() => { if (activeRef.current && roomRef.current === room) join(activeRef.current, { rejoin: true, ring: false }) }, 600 * r.n)
        } else {
          say('error', 'The call dropped. Join again to reconnect.')
          play('error')
          cleanup()
        }
      })

      room.on(lk.RoomEvent.EncryptionError, () => { if (roomRef.current === room) say('error', 'Could not decrypt the other person. They may need to unlock encryption in Settings, then rejoin.') })
      await withTimeout(room.connect(data.url, data.token), 20000, 'Could not connect to the call. Check your connection and try again.')
      if (seq !== seqRef.current) return
      if (provider) { await room.setE2EEEnabled(true); setSecure(true) } else setSecure(false)
      const unlock = () => room.startAudio().catch(() => {})
      window.addEventListener('pointerdown', unlock, { once: true })
      room.startAudio().catch(() => {}) // never block the call on the browser's audio unlock
      setStatus('connected')
      if (!quiet) play('join')

      const lp = room.localParticipant
      const want = optsRef.current
      if (deafRef.current) lp.setAttributes({ deaf: '1' }).catch(() => {})
      if (want.mic && !deafRef.current) { try { await lp.setMicrophoneEnabled(true) } catch (e) { say('error', mediaMessage(e)) } }
      if (want.cam) { try { await lp.setCameraEnabled(true) } catch (e) { say('error', mediaMessage(e)) } }
      if (opts.screen && !quiet) setShareOpen(true) // the share dialog gives the browser the click it needs
      refresh()

      if (spec.kind === 'group') startBeat(spec.id)
      if (spec.kind === 'dm' && !quiet && opts.ring !== false && spec.otherId) {
        const { data: inv, error: invErr } = await supabase
          .from('call_invites')
          .insert({ dm_id: spec.id, caller: me.id, callee: spec.otherId })
          .select('id')
          .single()
        if (invErr) say('error', invErr.message)
        else if (seq === seqRef.current) { inviteRef.current = inv.id; setRinging(true) }
      }
    } catch (e) {
      if (seq === seqRef.current) {
        say('error', e?.message || 'Could not start the call.')
        play('error')
        await cleanup()
      }
    }
  }, [cleanup, teardownRoom, refresh, say, startBeat, me.id])

  /* ---- ringing ends when the other person joins, or after 45 seconds ---- */
  useEffect(() => {
    if (ringing && parts.length > 1) endInvite()
  }, [ringing, parts.length, endInvite])
  useEffect(() => {
    if (!ringing) return
    const t = setTimeout(() => { endInvite(); say('info', 'No answer.') }, RING_MS)
    return () => clearTimeout(t)
  }, [ringing, endInvite, say])

  /* ---- controls ---- */
  const setDeafen = useCallback(async (next) => {
    const r = roomRef.current
    deafRef.current = next
    setDeaf(next)
    audioBox.current?.childNodes.forEach((el) => { el.muted = next })
    play(next ? 'deafen' : 'undeafen')
    if (!r) return
    const lp = r.localParticipant
    if (next) {
      micBeforeDeaf.current = lp.isMicrophoneEnabled
      try { await lp.setMicrophoneEnabled(false) } catch { /* ignore */ }
    } else if (micBeforeDeaf.current) {
      try { await lp.setMicrophoneEnabled(true) } catch (e) { say('error', mediaMessage(e)) }
    }
    lp.setAttributes({ deaf: next ? '1' : '' }).catch(() => {})
    optsRef.current.mic = lp.isMicrophoneEnabled
    refresh()
  }, [refresh, say])
  const toggleDeaf = useCallback(() => setDeafen(!deafRef.current), [setDeafen])

  const toggleMic = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    if (deafRef.current) { micBeforeDeaf.current = true; await setDeafen(false); return } // unmuting while deafened undeafens, like Discord
    const next = !r.localParticipant.isMicrophoneEnabled
    try { await r.localParticipant.setMicrophoneEnabled(next); play(next ? 'unmute' : 'mute') } catch (e) { say('error', mediaMessage(e)) }
    optsRef.current.mic = next
    refresh()
  }, [refresh, say, setDeafen])
  const toggleCam = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    const next = !r.localParticipant.isCameraEnabled
    try { await r.localParticipant.setCameraEnabled(next) } catch (e) { say('error', mediaMessage(e)) }
    optsRef.current.cam = next
    refresh()
  }, [refresh, say])

  // Ping: how long a message takes to reach the call server and come back. Read from the connection itself, every few seconds.
  useEffect(() => {
    if (status !== 'connected') { setPing(null); return undefined }
    let live = true
    const read = async () => {
      const t = roomRef.current?.engine?.pcManager
      for (const tr of [t?.publisher, t?.subscriber]) {
        try {
          const rep = await tr?.getStats()
          if (!rep) continue
          let rtt = null
          rep.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime * 1000 })
          if (rtt !== null) { if (live) setPing(Math.max(1, Math.round(rtt))); return }
        } catch { /* try the next one */ }
      }
    }
    read()
    const id = setInterval(read, 3000)
    return () => { live = false; clearInterval(id) }
  }, [status])

  const stopScreen = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    try { await r.localParticipant.setScreenShareEnabled(false) } catch { /* ignore */ }
    play('shareStop')
    refresh()
  }, [refresh])
  const startScreen = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    setShareOpen(false)
    const pf = getPrefs()
    const q = { light: [1280, 720, 15, 1_200_000], balanced: [1280, 720, 30, 2_500_000], sharp: [1920, 1080, 30, 5_000_000], detail: [1920, 1080, 15, 4_000_000] }[pf.shareQuality] || [1280, 720, 30, 2_500_000]
    const lp = r.localParticipant
    const attempts = [
      // Best: our quality choice, hide this tab from the list, allow switching, share sound if the browser can.
      () => lp.setScreenShareEnabled(
        true,
        { audio: pf.shareAudio, resolution: { width: q[0], height: q[1], frameRate: q[2] }, contentHint: pf.shareQuality === 'detail' || pf.shareQuality === 'light' ? 'detail' : 'motion', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' },
        { screenShareEncoding: { maxBitrate: q[3], maxFramerate: q[2] }, screenShareSimulcastLayers: [], degradationPreference: pf.shareQuality === 'detail' || pf.shareQuality === 'light' ? 'maintain-resolution' : 'maintain-framerate' }
      ),
      // Some browsers reject the extra options: retry with the plain request.
      () => lp.setScreenShareEnabled(true, { audio: pf.shareAudio }),
      () => lp.setScreenShareEnabled(true),
    ]
    let lastErr
    for (let i = 0; i < attempts.length; i++) {
      try {
        await attempts[i]()
        play('shareStart')
        refresh()
        return
      } catch (e) {
        lastErr = e
        if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') { refresh(); return } // they cancelled the picker
        try { await lp.setScreenShareEnabled(false) } catch { /* nothing to clean up */ }
      }
    }
    say('error', `Could not start screen sharing${lastErr?.name ? ` (${lastErr.name})` : ''}. Try another window or browser.`)
    play('error')
    refresh()
  }, [refresh, say])
  // Viewers can stop receiving someone's screen to save bandwidth and CPU, and start again later.
  const watchScreen = useCallback((id, on) => {
    const r = roomRef.current
    const lp = r?.remoteParticipants.get(id)
    const lk = lkRef.current
    const pub = lp?.getTrackPublication(lk.Track.Source.ScreenShare)
    if (!pub) return
    Promise.resolve(pub.setSubscribed(on)).catch(() => {}).finally(refresh)
  }, [refresh])
  const toggleScreen = useCallback(() => {
    const r = roomRef.current
    if (!r) return
    if (r.localParticipant.isScreenShareEnabled) stopScreen()
    else startScreen() // one click: straight to the browser's own picker, using your saved quality
  }, [stopScreen, startScreen])

  /* ---- outgoing ring sound ---- */
  useEffect(() => (ringing ? loop('ringback', 3000) : undefined), [ringing])

  /* ---- apply setting changes to a live call ---- */
  useEffect(() => {
    const r = roomRef.current
    if (!r || status !== 'connected') return
    audioBox.current?.childNodes.forEach((el) => { el.volume = prefs.outVolume })
    const swap = (kind, id) => { if (id) r.switchActiveDevice(kind, id).catch(() => {}) }
    swap('audioinput', prefs.inputId)
    swap('audiooutput', prefs.outputId)
    swap('videoinput', prefs.camId)
  }, [prefs.outVolume, prefs.inputId, prefs.outputId, prefs.camId, status])
  useEffect(() => {
    const r = roomRef.current
    const lk = lkRef.current
    if (!r || !lk || status !== 'connected') return
    const pub = r.localParticipant.getTrackPublication(lk.Track.Source.Microphone)
    pub?.audioTrack?.restartTrack({ echoCancellation: prefs.echo, noiseSuppression: prefs.noise, autoGainControl: prefs.agc }).catch(() => {})
  }, [prefs.echo, prefs.noise, prefs.agc, status])

  /* ---- coming back to the tab: make sure we are still in the call and still counted ---- */
  useEffect(() => {
    const back = () => {
      if (document.hidden) return
      const r = roomRef.current
      if (activeRef.current && !r) return // a rejoin is already scheduled
      if (!r) return
      if (r.state === 'disconnected') { join(activeRef.current, { rejoin: true, ring: false }); return }
      r.startAudio().catch(() => {})
      if (beatRef.current) supabase.from('group_voice').upsert({ group_id: beatRef.current.groupId, user_id: me.id }).then(() => {}, () => {})
      refresh()
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    window.addEventListener('online', back)
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); window.removeEventListener('online', back) }
  }, [join, refresh, me.id])

  /* ---- warm up: download the call library while the app is idle, so the first join is quick ---- */
  useEffect(() => {
    const warm = () => { import('livekit-client').then((m) => { lkRef.current ||= m }).catch(() => {}) }
    const t = 'requestIdleCallback' in window ? window.requestIdleCallback(warm, { timeout: 8000 }) : setTimeout(warm, 3000)
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(t) : clearTimeout(t))
  }, [])

  /* ---- a ring that started while the app was loading still shows up ---- */
  useEffect(() => {
    let live = true
    ;(async () => {
      const since = new Date(Date.now() - 40000).toISOString()
      const { data } = await supabase.from('call_invites').select('*').eq('callee', me.id).eq('status', 'ringing').gt('created_at', since).order('created_at', { ascending: false }).limit(1)
      const inv = data?.[0]
      if (!live || !inv) return
      const { data: caller } = await supabase.from('profiles').select('*').eq('id', inv.caller).maybeSingle()
      if (live) setIncoming((cur) => cur || { invite: inv, caller })
    })()
    return () => { live = false }
  }, [me.id])

  /* ---- incoming DM calls + caller-side decline ---- */
  useEffect(() => {
    const ch = supabase
      .channel(`calls-${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_invites', filter: `callee=eq.${me.id}` }, async (p) => {
        const inv = p.new
        if (inv.status !== 'ringing') return
        const { data: caller } = await supabase.from('profiles').select('*').eq('id', inv.caller).maybeSingle()
        setIncoming({ invite: inv, caller })
        if (document.hidden && localStorage.getItem('nook-notify') === '1' && 'Notification' in window && Notification.permission === 'granted') {
          try { new Notification(`${caller?.display_name || caller?.username || 'Someone'} is calling`, { tag: 'nook-call' }) } catch { /* ignore */ }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `callee=eq.${me.id}` }, (p) => {
        setIncoming((cur) => (cur && cur.invite.id === p.new.id && p.new.status !== 'ringing' ? null : cur))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `caller=eq.${me.id}` }, (p) => {
        if (p.new.status === 'declined' && p.new.id === inviteRef.current) {
          inviteRef.current = null
          setRinging(false)
          say('info', 'Call declined.')
          play('declined')
          if (roomRef.current && roomRef.current.remoteParticipants.size === 0) cleanup()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me.id, say, cleanup])

  useEffect(() => {
    if (!incoming) return
    const t = setTimeout(() => setIncoming(null), RING_MS)
    return () => clearTimeout(t)
  }, [incoming])

  const accept = useCallback(async () => {
    const inc = incoming
    if (!inc) return
    setIncoming(null)
    const name = inc.caller?.display_name || inc.caller?.username || 'Call'
    await join(
      { key: `dm:${inc.invite.dm_id}`, kind: 'dm', id: inc.invite.dm_id, title: name, otherId: inc.invite.caller, navigate: true },
      { ring: false }
    )
  }, [incoming, join])

  const decline = useCallback(async () => {
    const inc = incoming
    setIncoming(null)
    if (inc) await supabase.from('call_invites').update({ status: 'declined' }).eq('id', inc.invite.id)
  }, [incoming])

  // Leave cleanly if the app closes (sign out, navigation)
  useEffect(() => () => {
    const r = roomRef.current
    roomRef.current = null
    r?.disconnect()
    if (beatRef.current) clearInterval(beatRef.current.timer)
  }, [])

  /* ---- push to talk (this window) and the desktop's global mute / deafen keys ---- */
  const toggleMicRef = useRef(toggleMic)
  const toggleDeafRef = useRef(toggleDeaf)
  toggleMicRef.current = toggleMic
  toggleDeafRef.current = toggleDeaf
  useEffect(() => {
    const d = window.nookDesktop
    if (!d?.onHotkey) return undefined
    return d.onHotkey(({ action }) => { if (action === 'mute') toggleMicRef.current(); else if (action === 'deafen') toggleDeafRef.current() })
  }, [])
  const inCall = Boolean(active)
  useEffect(() => {
    if (!prefs.pttOn || !prefs.pttCode || !inCall) return undefined
    const set = (on) => {
      const lp = roomRef.current?.localParticipant
      if (!lp || deafRef.current || lp.isMicrophoneEnabled === on) return
      lp.setMicrophoneEnabled(on).then(() => { optsRef.current.mic = on; refresh() }).catch(() => {})
    }
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable
    const down = (e) => { if (e.code === prefs.pttCode && !e.repeat && !typing(e)) set(true) }
    const up = (e) => { if (e.code === prefs.pttCode) set(false) }
    const off = () => set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', off)
    const first = setTimeout(off, 1500) // starts muted: you talk only while the key is held
    return () => {
      clearTimeout(first)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', off)
    }
  }, [prefs.pttOn, prefs.pttCode, inCall, refresh])

  const value = useMemo(
    () => ({
      active, status, secure, ping, parts, local, ringing, incoming, toast, canScreen: canShareScreen, deaf, shareOpen, settingsOpen,
      join, leave, toggleMic, toggleCam, toggleScreen, toggleDeaf, startScreen, stopScreen, watchScreen, accept, decline, dismissToast,
      closeShare: () => setShareOpen(false), openShare: () => setShareOpen(true), openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false),
    }),
    [active, status, secure, ping, parts, local, ringing, incoming, toast, deaf, shareOpen, settingsOpen, join, leave, toggleMic, toggleCam, toggleScreen, toggleDeaf, startScreen, stopScreen, watchScreen, accept, decline, dismissToast]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <div ref={audioBox} style={{ display: 'none' }} aria-hidden="true" />
    </Ctx.Provider>
  )
}
