import { desktop, storeActivityIcon } from '../desktop.js'
import { loadPrefs, modeOf, usePrefsVersion } from '../notifPrefs.js'
import { notify, promptDialog } from '../dialog.jsx'
import { play } from '../sounds.js'
import { openContext } from '../contextmenu.jsx'
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { supabase } from '../supabase.js'
import Avatar, { GroupIcon } from './Avatar.jsx'
import Icon, { Logo } from './Icon.jsx'
import Chat from './Chat.jsx'
import ChanIcon from './ChanIcon.jsx'
import Mascot from './Mascot.jsx'
import { CallBar, CallButtons, CallStage, CallOverlays } from '../call/CallUI.jsx'
import VoiceCard from '../call/VoiceCard.jsx'
import GroupSidebar from './GroupSidebar.jsx'
import { useCall } from '../call/CallProvider.jsx'
import { useVoiceRoster } from '../call/useVoiceRoster.js'
import { modItems } from '../moderation.js'
import { ProfileEditor, ProfileCard, UserMenu, GroupModal, Friends, GroupSettings, ChannelSettings, AdminPanel, prefetchModals } from '../lazyModals.js'
import { statusExpired } from '../status.js'
import { Name } from '../cosmetics.jsx'
import { activityText } from '../status.js'
import { mentionsMe } from '../mentions.js'
import { initKeys, isSealed } from '../e2ee.js'
import { E2eeHost } from './Encryption.jsx'

function ChanLead({ c }) {
  return <span className="lead-icon lead-chan"><ChanIcon c={c} size={18} /></span>
}

function Count({ n }) {
  if (!n) return null
  return <span className="count">{n > 99 ? '99+' : n}</span>
}

export default function Shell({ session, profile, reloadProfile }) {
  const me = session.user
  useEffect(() => { prefetchModals() }, [])
  useEffect(() => { loadPrefs() }, [])
  const prefsVersion = usePrefsVersion()
  const chanGroupRef = useRef({})

  const [groups, setGroups] = useState([])
  const [dms, setDms] = useState([])
  const [chanGroup, setChanGroup] = useState({})
  const [unread, setUnread] = useState({})
  const [tip, setTip] = useState(null) // hover card for a group in the rail
  const [mentions, setMentions] = useState({}) // target id -> true when someone @mentioned you there while you were away
  const [lastMsg, setLastMsg] = useState({})
  const [view, setView] = useState({ type: 'home' })
  const [channelId, setChannelId] = useState(null)
  const [detail, setDetail] = useState({ categories: [], channels: [], members: [] })
  const [modal, setModal] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [friends, setFriends] = useState([])
  const call = useCall()

  // Automatic activity, shown as a list: what the desktop app finds (games, music, streaming, the app you are using)
  // plus calls and screen sharing. Several can be true at once. It never touches an activity you set yourself,
  // and it is refreshed every few minutes so it disappears by itself if the app closes.
  const autoOn = profile.activity_auto !== false
  const callKind = call.active?.kind
  const callTitle = call.active?.title
  const sharing = Boolean(call.active && call.local?.screen)
  const [detected, setDetected] = useState([])
  useEffect(() => {
    if (!desktop) return undefined
    const set = (a) => setDetected(Array.isArray(a) ? a : a ? [a] : [])
    desktop.getActivity().then(set, () => {})
    return desktop.onActivity(set)
  }, [])
  const want = useMemo(() => {
    if (!autoOn) return []
    const out = detected.map((d) => ({ t: d.type, n: d.name, icon: d.icon || null }))
    if (call.active) {
      // DM calls stay private: the other person's name is not published.
      const callName = String((callKind === 'group' ? callTitle : 'a private call') || 'a call').slice(0, 60)
      out.push({ t: sharing ? 'sharing' : 'calling', n: callName, icon: null })
    }
    return out.slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOn, Boolean(call.active), callKind, callTitle, sharing, detected])
  const wantRef = useRef(want)
  wantRef.current = want
  const profRef2 = useRef(profile)
  profRef2.current = profile
  useEffect(() => {
    let live = true
    const cur0 = profRef2.current
    // An older version kept one automatic activity in the single-activity fields; tidy that up once.
    if (cur0.activity_src === 'auto') {
      supabase.from('profiles').update({ activity_type: null, activity_name: null, activity_at: null, activity_src: null, activity_icon: null }).eq('id', me.id).then(() => reloadProfile())
    }
    const sameAs = (list) => {
      const have = Array.isArray(profRef2.current.activities) ? profRef2.current.activities : []
      return have.length === list.length && have.every((e, i) => e.t === list[i].t && e.n === list[i].n)
    }
    const push = async () => {
      const list = wantRef.current
      if (sameAs(list)) return
      const have = Array.isArray(profRef2.current.activities) ? profRef2.current.activities : []
      const now = new Date().toISOString()
      const entries = []
      for (const w of list) {
        let icon = null
        if (w.icon) { try { icon = await storeActivityIcon(me.id, w.icon) } catch { icon = null } }
        const old = have.find((e) => e.t === w.t && e.n === w.n)
        entries.push({ t: w.t, n: w.n, i: icon, s: old?.s || now }) // the start time carries over, so the timer keeps counting
      }
      if (!live || wantRef.current !== list) return
      supabase.from('profiles').update({ activities: entries, activity_seen: now }).eq('id', me.id).then(() => reloadProfile())
    }
    push()
    if (!want.length) return () => { live = false }
    const beat = setInterval(() => {
      if (wantRef.current.length) supabase.from('profiles').update({ activity_seen: new Date().toISOString() }).eq('id', me.id).then(() => {})
    }, 4 * 60 * 1000)
    return () => { live = false; clearInterval(beat) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want])

  // Desktop extras: taskbar flash and tooltip for unread messages, and an "update ready" prompt.
  const unreadSum = useMemo(() => Object.values(unread).reduce((n, v) => n + (v || 0), 0), [unread])
  useEffect(() => { desktop?.setUnread(unreadSum) }, [unreadSum])
  useEffect(() => {
    if (!desktop) return undefined
    const offReady = desktop.onUpdate(({ version }) => notify(`Nook ${version} is ready to install.`, 'info', { duration: 20000, action: { label: 'Restart', onClick: () => desktop.installUpdate() } }))
    const offStatus = desktop.onUpdateStatus?.(({ kind, text }) => notify(text, kind === 'error' ? 'error' : 'info'))
    return () => { offReady?.(); offStatus?.() }
  }, [])

  const loadFriends = useCallback(async () => {
    const { data: f } = await supabase.from('friendships').select('*')
    const rows = f || []
    const ids = [...new Set(rows.map((x) => (x.requester === me.id ? x.addressee : x.requester)))]
    let profs = {}
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', ids)
      profs = Object.fromEntries((p || []).map((x) => [x.id, x]))
    }
    setFriends(rows.map((x) => { const oid = x.requester === me.id ? x.addressee : x.requester; return { ...x, incoming: x.addressee === me.id, other: profs[oid] } }).filter((x) => x.other))
  }, [me.id])

  const loadLists = useCallback(async () => {
    const [{ data: gm }, { data: d }, { data: ch }] = await Promise.all([
      supabase.from('group_members').select('role, perms, groups(*)').eq('user_id', me.id),
      supabase.from('dms').select('*').or(`user_a.eq.${me.id},user_b.eq.${me.id}`),
      supabase.from('channels').select('id, group_id'),
    ])
    setGroups((gm || []).filter((r) => r.groups).map((r) => ({ ...r.groups, role: r.role, perms: r.perms || [] })))
    setChanGroup(Object.fromEntries((ch || []).map((c) => [c.id, c.group_id])))
    const others = (d || []).map((x) => (x.user_a === me.id ? x.user_b : x.user_a))
    let profs = {}
    if (others.length) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', others)
      profs = Object.fromEntries((p || []).map((x) => [x.id, x]))
    }
    setDms((d || []).map((x) => ({ ...x, other: profs[x.user_a === me.id ? x.user_b : x.user_a] })))
  }, [me.id])

  // Chats touched locally while a count was being fetched keep their local value, so a slow answer can never bring back an old badge.
  const touched = useRef({})
  const pendingMarks = useRef(new Set())
  const loadUnread = useCallback(async () => {
    // Let any "mark as read" still on its way land first, otherwise the server could answer with the old count.
    if (pendingMarks.current.size) await Promise.allSettled([...pendingMarks.current])
    const started = Date.now()
    const [{ data }, men] = await Promise.all([
      supabase.rpc('unread_counts'),
      supabase.rpc('mention_counts', { uname: profileRef.current.username }).then((r) => r, () => ({ data: null })),
    ])
    if (!data) return
    if (men?.data) setMentions(Object.fromEntries(men.data.filter((r) => Number(r.mentions) > 0 && !(r.target_id === activeRef.current && !document.hidden && document.hasFocus())).map((r) => [r.target_id, true])))
    const map = Object.fromEntries(data.map((r) => [r.target_id, Number(r.unread)]))
    const here = activeRef.current
    const looking = !document.hidden && document.hasFocus()
    if (here && map[here] && looking) {
      map[here] = 0
      touched.current[here] = Date.now()
      const p = Promise.resolve(supabase.rpc('mark_read', { target: here })).finally(() => pendingMarks.current.delete(p))
      pendingMarks.current.add(p)
    }
    setUnread((cur) => {
      for (const [id, at] of Object.entries(touched.current)) if (at >= started) map[id] = cur[id] || 0
      return map
    })
  }, [])

  useEffect(() => { initKeys(me.id).catch(() => {}) }, [me.id])

  // Site-wide announcement from staff
  const [notice, setNotice] = useState(null)
  useEffect(() => {
    supabase.from('site_notice').select('body, level, updated_at').eq('id', 1).maybeSingle().then(({ data }) => {
      let seen = null
      try { seen = localStorage.getItem('nook-notice') } catch { /* ignore */ }
      if (data?.body && seen !== data.updated_at) setNotice(data)
    }, () => {})
  }, [])

  useEffect(() => {
    loadLists()
    loadUnread()
    loadFriends()
  }, [loadLists, loadUnread, loadFriends])

  // Friend requests and accepted friends show up live
  useEffect(() => {
    let t
    const ch = supabase
      .channel(`friends-${me.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        clearTimeout(t)
        t = setTimeout(() => { loadFriends(); loadLists() }, 150)
      })
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [me.id, loadFriends, loadLists])

  useEffect(() => {
    const up = () => { setOnline(true); loadLists(); loadUnread() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [loadLists, loadUnread])

  const groupId = view.type === 'group' ? view.id : null

  const loadGroup = useCallback(async () => {
    if (!groupId) return
    const [{ data: cats }, { data: chans }, { data: mem }] = await Promise.all([
      supabase.from('categories').select('*').eq('group_id', groupId).order('position'),
      supabase.from('channels').select('*').eq('group_id', groupId).order('position'),
      supabase.from('group_members').select('user_id, role, perms, timeout_until').eq('group_id', groupId),
    ])
    let profs = {}
    if (mem?.length) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', mem.map((m) => m.user_id))
      profs = Object.fromEntries((p || []).map((x) => [x.id, x]))
    }
    setDetail({
      categories: cats || [],
      channels: chans || [],
      members: (mem || []).map((m) => ({ ...m, profile: profs[m.user_id] })).sort((a, b) => (a.role === 'founder' ? -1 : b.role === 'founder' ? 1 : 0)),
    })
    setChanGroup((prev) => ({ ...prev, ...Object.fromEntries((chans || []).map((c) => [c.id, groupId])) }))
    setChannelId((cur) => (chans?.some((c) => c.id === cur) ? cur : chans?.[0]?.id || null))
  }, [groupId])

  useEffect(() => {
    setDetail({ categories: [], channels: [], members: [] })
    loadGroup()
    if (!groupId) return
    // A drag-and-drop save changes many rows at once, so wait a moment and reload once.
    let timer
    const soon = () => { clearTimeout(timer); timer = setTimeout(loadGroup, 200) }
    const ch = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `group_id=eq.${groupId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, soon)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [groupId, loadGroup])

  const group = groups.find((g) => g.id === groupId)
  const isFounder = group?.role === 'founder'
  const can = useMemo(() => {
    const all = ['channels', 'messages', 'emoji', 'invites', 'members', 'customize']
    return Object.fromEntries(all.map((k) => [k, isFounder || Boolean(group?.perms?.includes(k))]))
  }, [isFounder, group?.perms])
  const channel = detail.channels.find((c) => c.id === channelId)
  const dm = view.type === 'dm' ? dms.find((d) => d.id === view.id) : null
  const activeTarget = view.type === 'dm' ? view.id : view.type === 'group' ? channelId : null

  const roomSpec =
    view.type === 'dm' && dm?.other
      ? { key: `dm:${dm.id}`, kind: 'dm', id: dm.id, title: dm.other.display_name || dm.other.username || 'Call', otherId: dm.other.id }
      : view.type === 'group' && group
        ? { key: `gr:${group.id}`, kind: 'group', id: group.id, groupId: group.id, title: `${group.name} voice` }
        : null

  const voice = useVoiceRoster(useMemo(() => groups.map((g) => g.id), [groups]))
  // People in voice in groups other than the one you are looking at: fetch their names and pictures once.
  const [voiceProfs, setVoiceProfs] = useState({})
  useEffect(() => {
    const need = [...new Set(Object.values(voice).flat())].filter((id) => !voiceProfs[id] && !memberById[id])
    if (!need.length) return
    supabase.from('profiles').select('*').in('id', need).then(({ data }) => { if (data) setVoiceProfs((cur) => ({ ...cur, ...Object.fromEntries(data.map((p) => [p.id, p])) })) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])
  const memberById = useMemo(() => Object.fromEntries(detail.members.map((m) => [m.user_id, m.profile])), [detail.members])

  // Keep the latest values available to the realtime handler without resubscribing
  const activeRef = useRef(null)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const dmsRef = useRef([])
  activeRef.current = activeTarget
  dmsRef.current = dms

  // Jump to the room a call belongs to (from the sidebar bar, header pill, or after accepting a ring)
  const openCallRoom = useCallback(async (spec) => {
    if (spec.kind === 'dm') {
      if (!dmsRef.current.some((d) => d.id === spec.id)) await loadLists()
      setView({ type: 'dm', id: spec.id })
    } else {
      setView({ type: 'group', id: spec.groupId })
    }
    setNavOpen(false)
  }, [loadLists])
  useEffect(() => {
    if (call.active?.navigate) openCallRoom(call.active)
  }, [call.active, openCallRoom])

  const markRead = useCallback((t) => {
    if (!t) return
    touched.current[t] = Date.now()
    const p = Promise.resolve(supabase.rpc('mark_read', { target: t })).finally(() => pendingMarks.current.delete(p))
    pendingMarks.current.add(p)
    setUnread((u) => (u[t] ? { ...u, [t]: 0 } : u))
    setMentions((x) => (x[t] ? { ...x, [t]: false } : x))
  }, [])

  useEffect(() => {
    markRead(activeTarget)
    const onFocus = () => markRead(activeRef.current)
    // Coming back to the tab: clear what you are looking at, then refresh the counts for everything else.
    const onVisible = () => {
      if (document.hidden) return
      markRead(activeRef.current)
      loadUnread()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeTarget, markRead, loadUnread])

  // Leaving a chat you were looking at counts as having read it, even if a late message event is still on its way.
  useEffect(() => {
    const t = activeTarget
    return () => { if (t && !document.hidden && document.hasFocus()) markRead(t) }
  }, [activeTarget, markRead])

  // After a message arrives that we did not see, ask the server for the true counts a moment later.
  const refreshTimer = useRef(0)
  useEffect(() => () => clearTimeout(refreshTimer.current), [])
  const soonUnread = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(loadUnread, 900)
  }, [loadUnread])

  // Global inbox: unread counts, new DMs, desktop notifications
  useEffect(() => {
    async function notify(m) {
      if (localStorage.getItem('nook-notify') !== '1' || !('Notification' in window) || Notification.permission !== 'granted') return
      const { data } = await supabase.from('profiles').select('display_name, username').eq('id', m.author_id).maybeSingle()
      try {
        new Notification(data?.display_name || data?.username || 'New message', { body: isSealed(m.content) ? 'Sent you a message' : mentionsMe(m.content, profileRef.current.username) ? `Mentioned you: ${m.content}` : (m.content || 'Sent an attachment'), tag: m.channel_id || m.dm_id })
      } catch { /* ignore */ }
    }
    const ch = supabase
      .channel('inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new
        const tid = m.channel_id || m.dm_id
        setLastMsg((prev) => ({ ...prev, [tid]: m.created_at }))
        if (m.author_id === me.id) return
        const seen = activeRef.current === tid && document.hasFocus() && !document.hidden
        if (seen) {
          markRead(tid)
        } else {
          touched.current[tid] = Date.now()
          setUnread((u) => ({ ...u, [tid]: (u[tid] || 0) + 1 }))
          const mention = Boolean(m.channel_id && mentionsMe(m.content, profileRef.current.username))
          if (mention) setMentions((x) => ({ ...x, [tid]: true }))
          soonUnread()
          // Notification settings: "all" makes noise for everything, "mentions" only when you are mentioned, "none" never.
          const mode = modeOf({ channelId: m.channel_id, groupId: chanGroupRef.current[m.channel_id], dmId: m.dm_id })
          if (mode === 'all' || (mode === 'mentions' && mention)) { play('message'); notify(m) }
        }
        if (m.dm_id && !dmsRef.current.some((d) => d.id === m.dm_id)) loadLists()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me.id, markRead, loadLists, soonUnread])

  // A custom status can be set to clear itself.
  useEffect(() => {
    if (!profile.status_expires_at) return undefined
    const clear = async () => {
      await supabase.from('profiles').update({ status_text: '', status_icon: '', status_expires_at: null }).eq('id', me.id)
      reloadProfile()
    }
    const ms = new Date(profile.status_expires_at) - Date.now()
    if (statusExpired(profile)) { clear(); return undefined }
    const t = setTimeout(clear, Math.min(ms, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [profile.status_expires_at, me.id, reloadProfile])

  const pendingIn = friends.filter((f) => f.status === 'pending' && f.incoming).length
  // Chats you muted (or set to mentions only) do not show a number; an @mention still shows its red dot.
  const unreadShown = useMemo(() => {
    const out = {}
    for (const [t, n] of Object.entries(unread)) {
      if (!n) continue
      const mode = modeOf({ channelId: t, groupId: chanGroup[t], dmId: t })
      if (mode === 'all') out[t] = n
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, chanGroup, prefsVersion])
  chanGroupRef.current = chanGroup
  const unreadTotal = Object.values(unreadShown).reduce((a, b) => a + b, 0)
  useEffect(() => {
    document.title = unreadTotal ? `(${unreadTotal > 99 ? '99+' : unreadTotal}) Nook` : 'Nook'
  }, [unreadTotal])

  const dmIds = new Set(dms.map((d) => d.id))
  const homeUnread = Object.entries(unreadShown).reduce((s, [t, n]) => (dmIds.has(t) ? s + n : s), 0)
  const groupUnread = (gid) => Object.entries(unreadShown).reduce((s, [t, n]) => (chanGroup[t] === gid ? s + n : s), 0)

  const sortedDms = useMemo(
    () => [...dms].sort((a, b) => new Date(lastMsg[b.id] || b.created_at) - new Date(lastMsg[a.id] || a.created_at)),
    [dms, lastMsg]
  )

  async function openDM(userId) {
    const { data, error } = await supabase.rpc('start_dm', { other: userId })
    if (error) return notify(error.message, 'error')
    await loadLists()
    setView({ type: 'dm', id: data })
    setNavOpen(false)
  }

  function pick(v, ch) {
    setView(v)
    if (ch) setChannelId(ch)
    setNavOpen(false)
  }

  const inRoom = Boolean(call.active && roomSpec && call.active.key === roomSpec.key)
  const showWelcome = view.type === 'home' || (view.type === 'dm' && !dm) || (view.type === 'group' && !channel)

  return (
    <div className="app">
      {!online && <div className="offline"><Icon name="wifioff" size={14} /> You are offline. Reconnecting when your connection returns.</div>}
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      {notice && <div className={`offline notice ${notice.level}`} role="status"><Icon name={notice.level === 'warn' ? 'alert' : 'bell'} size={14} /><span>{notice.body}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => { try { localStorage.setItem('nook-notice', notice.updated_at) } catch { /* ignore */ } setNotice(null) }}><Icon name="x" size={13} /></button></div>}
      {profile.banned_at && <div className="offline banned" role="alert"><Icon name="ban" size={14} /> Your account is suspended{profile.ban_reason ? `: ${profile.ban_reason}` : ''}. You can read messages but not send them.</div>}
      <nav className={`nav ${navOpen ? 'open' : ''}`}>
        <div className="rail">
          <button className={`rail-btn home ${view.type !== 'group' ? 'on' : ''}`} title="Home and messages" onClick={() => pick({ type: 'home' })}>
            <Logo size={40} />
            {view.type === 'group' && homeUnread > 0 && <span className="count rail-count">{homeUnread > 99 ? '99+' : homeUnread}</span>}
          </button>
          <div className="rail-sep" />
          {groups.map((g) => (
            <button key={g.id} className={`rail-btn ${groupId === g.id ? 'on' : ''}`} title={voice[g.id]?.length ? undefined : g.name} onClick={() => pick({ type: 'group', id: g.id })} onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ id: g.id, x: r.right + 10, y: r.top + r.height / 2 }) }} onMouseLeave={() => setTip(null)} onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ id: g.id, x: r.right + 10, y: r.top + r.height / 2 }) }} onBlur={() => setTip(null)}>
              <GroupIcon group={g} size={40} />
              {groupId !== g.id && groupUnread(g.id) > 0 && <span className={`rail-dot ${Object.keys(mentions).some((t) => mentions[t] && chanGroup[t] === g.id) ? 'mention' : ''}`} />}
              {(voice[g.id]?.length || 0) > 0 && <span className="rail-voice" aria-label={`${voice[g.id].length} in voice`}><Icon name="headphones" size={10} />{voice[g.id].length}</span>}
            </button>
          ))}
          <button className="rail-btn add" title="Create or join a group" onClick={() => setModal('group')}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        {tip && voice[tip.id]?.length > 0 && (
          <div className="rail-pop" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            <strong>{groups.find((g) => g.id === tip.id)?.name}</strong><span className="muted tiny">In voice now</span>
            {voice[tip.id].slice(0, 8).map((uid) => { const p = memberById[uid] || voiceProfs[uid]; return <span className="rail-pop-row" key={uid}><Avatar profile={p || { id: uid, username: '?' }} size={20} /><span className="ellipsis">{p ? (p.display_name || p.username) : 'Someone'}</span></span> })}
            {voice[tip.id].length > 8 && <span className="muted tiny">and {voice[tip.id].length - 8} more</span>}
          </div>
        )}
        <div className="side">
          {view.type !== 'group' ? (
            <>
              <div className="side-head">
                <strong>Messages</strong>
                <button className="icon-btn" title="Friends" aria-label="Friends" onClick={() => setModal('friends')}><Icon name="users" size={16} />{pendingIn > 0 && <span className="count pip">{pendingIn}</span>}</button>
              </div>
              <div className="side-list">
                {groups.some((g) => voice[g.id]?.length) && (
                  <div className="live-now">
                    <div className="cat-label static"><span>In voice now</span></div>
                    {groups.filter((g) => voice[g.id]?.length).map((g) => (
                      <button key={g.id} className="row-btn live-row" onClick={() => pick({ type: 'group', id: g.id })} title={`Open ${g.name}`}>
                        <GroupIcon group={g} size={28} />
                        <span className="live-text"><span className="ellipsis">{g.name}</span><span className="avatar-stack">{voice[g.id].slice(0, 5).map((uid) => <Avatar key={uid} profile={memberById[uid] || voiceProfs[uid] || { id: uid, username: '?' }} size={18} />)}{voice[g.id].length > 5 && <i>+{voice[g.id].length - 5}</i>}</span></span>
                        <span className="live-pill static">{voice[g.id].length}</span>
                      </button>
                    ))}
                  </div>
                )}
                {dms.length === 0 && (
                  <div className="empty-side"><Mascot mood="sleepy" size={64} animated /><span>No chats yet. Add a friend and they will show up here.</span><button className="primary small" onClick={() => setModal('friends')}>Add a friend</button></div>
                )}
                {sortedDms.map((d) => (
                  <button key={d.id} className={`row-btn ${view.type === 'dm' && view.id === d.id ? 'on' : ''} ${unreadShown[d.id] && view.id !== d.id ? 'unread' : ''}`} onClick={() => pick({ type: 'dm', id: d.id })}
                    onContextMenu={(e) => openContext(e, [
                      { label: 'Open chat', icon: 'message', onClick: () => pick({ type: 'dm', id: d.id }) },
                      d.other && { label: 'View profile', icon: 'user', onClick: () => setModal({ profile: d.other }) },
                      unreadShown[d.id] > 0 && { label: 'Mark as read', icon: 'check', onClick: () => markRead(d.id) },
                      d.other && { label: 'Copy user ID', icon: 'copy', onClick: () => navigator.clipboard?.writeText(d.other.id).then(() => notify('User ID copied.'), () => {}) },
                    ])}>
                    <Avatar profile={d.other} size={28} status />
                    <span className="ellipsis">{d.other ? <Name profile={d.other} /> : 'Unknown'}</span>
                    {view.id !== d.id && <Count n={unreadShown[d.id]} />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className={`side-head ${group?.banner_url ? 'has-banner' : ''}`} style={{ ...(group?.banner_url ? { '--gb': `url(${group.banner_url})` } : {}), ...(group?.accent ? { '--ga': group.accent } : {}) }}>
                <strong className="ellipsis" title={group?.description || undefined}>{group?.name}</strong>
                <button className="icon-btn" title="Group settings" onClick={() => setModal('settings')}><Icon name="sliders" size={16} /></button>
              </div>
              {roomSpec && <VoiceCard key={`v-${groupId}`} spec={roomSpec} ids={voice[groupId] || []} memberById={memberById} />}
              <GroupSidebar key={`s-${groupId}`} group={group} detail={detail} channelId={channelId} unread={unreadShown} mentions={mentions} isFounder={can.channels} onChannelSettings={(c) => setModal({ channelSettings: c })} onPick={(id) => pick(view, id)} onChanged={loadGroup} />
            </>
          )}

          <CallBar onOpen={openCallRoom} />
          <div className="me-bar">
            {menuOpen && (
              <Suspense fallback={null}>
                <UserMenu profile={profile} reload={reloadProfile} onClose={() => setMenuOpen(false)} onEdit={() => setModal({ settings: 'profile' })} onVoice={() => setModal({ settings: 'voice' })} onSignOut={() => supabase.auth.signOut()} onHome={() => { window.location.hash = '#/home' }} />
              </Suspense>
            )}
            <button className="me-btn" onClick={() => setMenuOpen((v) => !v)} title="Your profile, status and settings" aria-haspopup="menu" aria-expanded={menuOpen}>
              <Avatar profile={profile} size={32} status />
              <span className="me-text">
                <strong className="ellipsis">{profile.display_name || profile.username}</strong>
                <span className="muted tiny ellipsis">{profile.status_text || `@${profile.username}`}</span>
              </span>
            </button>
            {profile.badges?.includes('staff') && <button className="icon-btn staff-btn" title="Staff panel" aria-label="Staff panel" onClick={() => setModal('admin')}><Icon name="shield" size={16} /></button>}
            <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => setModal({ settings: 'profile' })}><Icon name="settings" size={16} /></button>
          </div>
        </div>
      </nav>

      <main className="main">
        {inRoom && <CallStage />}
        {view.type === 'dm' && dm && (
          <Chat
            key={dm.id}
            target={{ dm_id: dm.id }}
            title={dm.other?.display_name || dm.other?.username || 'Chat'}
            subtitle={dm.other?.status_text}
            lead={<Avatar profile={dm.other} size={28} status />}
            me={me}
            myName={profile.username}
            peopleList={[dm.other, profile].filter(Boolean)}
            otherId={dm.other?.id}
            onOpenProfile={(p) => setModal({ profile: p })}
            onMenu={() => setNavOpen(true)}
            headerExtra={<CallButtons spec={roomSpec} onOpen={openCallRoom} />}
          />
        )}
        {view.type === 'group' && channel && (
          <Chat
            key={channel.id}
            target={{ channel_id: channel.id }}
            onJumpChannel={(cid) => setChannelId(cid)}
            title={channel.name}
            subtitle={channel.topic}
            onEditTopic={can.channels ? async () => {
              const topic = await promptDialog({ title: `Topic for #${channel.name}`, value: channel.topic || '', maxLength: 120, placeholder: 'What is this channel for?' })
              if (topic === null) return
              const { error } = await supabase.from('channels').update({ topic: topic.trim().slice(0, 120) }).eq('id', channel.id)
              error ? notify(error.message, 'error') : loadGroup()
            } : undefined}
            me={me}
            isFounder={can.messages}
            canMembers={can.members}
            onModerated={loadGroup}
            groupId={groupId}
            myName={profile.username}
            members={detail.members}
            rules={{ read_only: channel.read_only, slowmode: channel.slowmode }}
            lead={<ChanLead c={channel} />}
            onOpenProfile={(p) => setModal({ profile: p })}
            onMenu={() => setNavOpen(true)}
            headerExtra={
              <>
                {!inRoom && <CallButtons spec={roomSpec} onOpen={openCallRoom} />}
                <button className="icon-btn" title="Members" onClick={() => setMembersOpen((v) => !v)}><Icon name="users" size={17} /></button>
              </>
            }
          />
        )}
        {showWelcome && (
          <section className="chat">
            <header className="chat-head">
              <button className="icon-btn only-mobile" onClick={() => setNavOpen(true)} aria-label="Open menu"><Icon name="menu" size={18} /></button>
              <strong>Welcome to Nook</strong>
            </header>
            <div className="welcome">
              <Mascot mood="wave" size={120} animated />
              <h2>Hey, {profile.display_name || profile.username}</h2>
              <p className="muted">Pick a conversation, add a friend, or create a group chat with its own channels and categories.</p>
              <div className="row center">
                <button className="primary" onClick={() => setModal('friends')}><Icon name="users" size={15} /> Friends{pendingIn > 0 ? ` (${pendingIn})` : ''}</button>
                <button className="ghost" onClick={() => setModal('group')}><Icon name="plus" size={15} /> Create or join a group</button>
              </div>
            </div>
          </section>
        )}
      </main>

      {view.type === 'group' && (
        <aside className={`members ${membersOpen ? 'open' : ''}`}>
          <div className="side-head">
            <strong>Members <span className="muted">{detail.members.length}</span></strong>
            <button className="icon-btn only-mobile" onClick={() => setMembersOpen(false)}><Icon name="x" size={16} /></button>
          </div>
          <div className="side-list">
            {detail.members.map((m) => (
              <button key={m.user_id} className="row-btn" onClick={() => m.profile && setModal({ profile: m.profile })}
                onContextMenu={(e) => m.profile && openContext(e, [
                  { label: 'View profile', icon: 'user', onClick: () => setModal({ profile: m.profile }) },
                  m.user_id !== me.id && { label: 'Send message', icon: 'message', onClick: () => openDM(m.user_id) },
                  { label: 'Copy user ID', icon: 'copy', onClick: () => navigator.clipboard?.writeText(m.user_id).then(() => notify('User ID copied.'), () => {}) },
                  ...(m.user_id !== me.id && (can.members || can.messages) ? ['sep', ...modItems({ groupId, member: m, name: m.profile.display_name || m.profile.username, canMembers: can.members, canMessages: can.messages, onDone: loadGroup })] : []),
                ])}>
                <Avatar profile={m.profile} size={28} status />
                <span className="member-text">
                  <span className="ellipsis"><Name profile={m.profile} /></span>
                  {activityText(m.profile) ? <span className="muted tiny ellipsis">{activityText(m.profile)}</span> : m.profile?.status_text && <span className="muted tiny ellipsis">{m.profile.status_text}</span>}
                </span>
                {m.role === 'founder' && <span className="badge" title="Founder"><Icon name="crown" size={11} /></span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      <Suspense fallback={null}>
      {modal?.settings && <ProfileEditor key={modal.settings} initialTab={modal.settings} profile={profile} onClose={() => setModal(null)} onSaved={reloadProfile} onSignOut={() => supabase.auth.signOut()} />}
      {modal?.profile && <ProfileCard profile={modal.profile} role={detail.members.find((m) => m.user_id === modal.profile.id)?.role} me={me} onClose={() => setModal(null)} onMessage={openDM} onBlocked={loadLists} onEdit={() => setModal({ settings: 'profile' })} />}
      {modal === 'group' && (
        <GroupModal
          onClose={() => setModal(null)}
          onDone={async (id) => {
            await loadLists()
            setModal(null)
            setView({ type: 'group', id })
          }}
        />
      )}
      {modal === 'friends' && (
        <Friends
          friends={friends}
          startTab={pendingIn > 0 ? 'pending' : 'all'}
          onClose={() => setModal(null)}
          onChanged={() => { loadFriends(); loadLists() }}
          onOpenDM={async (userId, dmId) => {
            let id = dmId
            if (!id) {
              const { data, error } = await supabase.rpc('start_dm', { other: userId })
              if (error) return notify(error.message, 'error')
              id = data
            }
            await loadLists()
            setModal(null)
            setView({ type: 'dm', id })
            setNavOpen(false)
          }}
        />
      )}
      {modal === 'admin' && profile.badges?.includes('staff') && <Suspense fallback={null}><AdminPanel onClose={() => setModal(null)} /></Suspense>}
      {modal?.channelSettings && (
        <ChannelSettings me={me} channel={modal.channelSettings} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadGroup() }} />
      )}
      {modal === 'settings' && group && (
        <GroupSettings
          group={group}
          categories={detail.categories}
          channels={detail.channels}
          members={detail.members}
          me={me}
          isFounder={isFounder}
          can={can}
          onClose={() => setModal(null)}
          onChanged={() => { loadGroup(); loadLists() }}
          onLeft={async () => { setModal(null); setView({ type: 'home' }); await loadLists() }}
        />
      )}
      </Suspense>
      <CallOverlays inRoom={inRoom} onOpen={openCallRoom} />
      <E2eeHost me={me} />
    </div>
  )
}
