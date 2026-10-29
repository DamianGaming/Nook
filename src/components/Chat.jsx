import { confirmDialog, reportDialog, notify } from '../dialog.jsx'
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { supabase } from '../supabase.js'
import { uploadMedia, checkMedia, isVideoUrl, isAudioUrl, isVoiceUrl, audioInfo, ACCEPT_MEDIA } from '../upload.js'
import { useDmSession, isSealed, seal, open as openSealed, sealFile, uploadSealed, requestE2eeDialog, repin } from '../e2ee.js'
import SealedAttach from './SealedAttach.jsx'
import AudioPlayer from './AudioPlayer.jsx'

const VideoPlayer = lazy(() => import('./VideoPlayer.jsx'))
const VoiceRecorder = lazy(() => import('./VoiceRecorder.jsx'))
const EmojiPicker = lazy(() => import('./EmojiPicker.jsx'))
const SafetyDialog = lazy(() => import('./Encryption.jsx').then((m) => ({ default: m.SafetyDialog })))
const kindLabel = (url) => (isVideoUrl(url) ? 'Video' : isVoiceUrl(url) ? 'Voice message' : isAudioUrl(url) ? 'Audio' : 'Image')
import { loadEmoji, replaceShortcodes, openShortcode, searchEmoji, searchCustom, encodeCustom, decodeCustom, loadCustomEmoji, resolveCustom, CUSTOM_TOKEN } from '../emoji.js'
import CustomEmoji from './CustomEmoji.jsx'
import { mentionsMe, openMention } from '../mentions.js'
import { Name } from '../cosmetics.jsx'
import { BadgeRow } from '../badges.jsx'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import Mascot from './Mascot.jsx'
import NotifBell from './NotifBell.jsx'
import PinsPanel from './Pins.jsx'
import { jump } from '../jump.js'
import { openContext } from '../contextmenu.jsx'

const PAGE = 50

// Quick reactions; the + opens every emoji, including your custom ones.
const QUICK = ['❤️', '👍', '😂', '😮', '😢', '🎉']
const LEGACY = { heart: '❤️', like: '👍', smile: '😊', star: '⭐' } // older reactions, before any emoji was allowed
const CUSTOM_KIND = /^<e:([0-9a-f-]{36}):([a-z0-9_]{2,32})>$/
const kindOf = (k) => LEGACY[k] || k
function ReactionFace({ kind }) {
  const m = CUSTOM_KIND.exec(kind)
  return m ? <CustomEmoji id={m[1]} name={m[2]} /> : <span className="rx-emoji">{kind}</span>
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function dayKey(iso) {
  return new Date(iso).toDateString()
}
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

// Links, `code` and **bold** (no raw HTML is ever injected)
const TOKEN = /(https?:\/\/[^\s<]+|`[^`\n]+`|\*\*[^*\n]+\*\*|<e:[0-9a-f-]{36}:[a-z0-9_]{2,32}>|(?<![A-Za-z0-9_])@[A-Za-z0-9_]{2,24})/g
function renderText(text, ctx) {
  return text.split(TOKEN).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
    }
    if (part.startsWith('@') && ctx) {
      const n = part.slice(1).toLowerCase()
      if (n === 'everyone' || n === 'here') return ctx.everyoneOk ? <span key={i} className="mention-chip all" title="Notifies everyone here">{part}</span> : part
      const pr = ctx.byName.get(n)
      if (pr) return <button key={i} type="button" className={`mention-chip ${pr.id === ctx.me ? 'me' : ''}`} onClick={() => ctx.open(pr)}>@{pr.display_name || pr.username}</button>
      return part
    }
    const ce = /^<e:([0-9a-f-]{36}):([a-z0-9_]{2,32})>$/.exec(part)
    if (ce) return <CustomEmoji key={i} id={ce[1]} name={ce[2]} />
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return part
  })
}

export default function Chat({ target, title, subtitle, lead, me, isFounder, onOpenProfile, headerExtra, onMenu, onEditTopic, otherId, groupId, rules, members, peopleList, myName, onJumpChannel }) {
  const col = target.channel_id ? 'channel_id' : 'dm_id'
  const val = target.channel_id || target.dm_id
  const key = `${col}:${val}`
  useEffect(() => { loadCustomEmoji() }, [])

  const [messages, setMessages] = useState([])
  const [authors, setAuthors] = useState({})
  const [parents, setParents] = useState({})
  const [reactions, setReactions] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [attach, setAttach] = useState(null) // { url } | { busy: true }
  const [picker, setPicker] = useState(null)
  const [typers, setTypers] = useState({})
  const [atBottom, setAtBottom] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scope, setScope] = useState('channel') // channel | group (search)
  const [pinIds, setPinIds] = useState([])
  const [pinsOpen, setPinsOpen] = useState(false)
  const canPin = Boolean(target.dm_id || isFounder)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [attn, setAttn] = useState(() => new Set()) // messages that just got a reply or reaction and have not been looked at yet
  const [leaving, setLeaving] = useState(() => new Set())
  const [reactFull, setReactFull] = useState(null) // the full emoji picker for a reaction: { id, x, y }

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const sess = useDmSession(target.dm_id, otherId) // end-to-end encryption state of this DM
  const [plain, setPlain] = useState({}) // id -> opened message { t, a, src } or { err, src }
  const [safetyOpen, setSafetyOpen] = useState(false)
  const sealedMode = Boolean(target.dm_id) && sess.status === 'ready'
  const locked = Boolean(rules?.read_only) && !isFounder
  const [men, setMen] = useState(null) // { start, list, i } while an @mention is being typed
  const [emojiOpen, setEmojiOpen] = useState(false)
  const pickedRef = useRef(new Map()) // :name: -> id of the custom emoji chosen from the picker
  const lastSent = useRef(0)
  const [cool, setCool] = useState(0)
  const [emo, setEmo] = useState(null) // { start, list, i } while a :shortcode is being typed
  const stickRef = useRef(true)
  const authorsRef = useRef({})
  const messagesRef = useRef([])
  const chanRef = useRef(null)
  const lastTyping = useRef(0)
  authorsRef.current = authors
  messagesRef.current = messages

  const ensureAuthors = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !authorsRef.current[id])
    if (!missing.length) return
    const { data } = await supabase.from('profiles').select('*').in('id', missing)
    if (data) setAuthors((prev) => ({ ...prev, ...Object.fromEntries(data.map((p) => [p.id, p])) }))
  }, [])

  const loadExtras = useCallback(async (msgs) => {
    if (!msgs.length) return
    const ids = msgs.map((m) => m.id)
    const [{ data: rx }] = await Promise.all([supabase.from('reactions').select('*').in('message_id', ids)])
    if (rx) setReactions((prev) => [...prev.filter((r) => !ids.includes(r.message_id)), ...rx])
    const known = new Set([...messagesRef.current.map((m) => m.id), ...ids])
    const need = [...new Set(msgs.map((m) => m.reply_to).filter((id) => id && !known.has(id)))]
    if (need.length) {
      const { data: ps } = await supabase.from('messages').select('*').in('id', need)
      if (ps) {
        await ensureAuthors(ps.map((p) => p.author_id))
        setParents((prev) => ({ ...prev, ...Object.fromEntries(ps.map((p) => [p.id, p])) }))
      }
    }
  }, [ensureAuthors])

  useEffect(() => {
    let active = true
    setMessages([])
    setReactions([])
    setParents({})
    setError('')
    setEditing(null)
    setReplyTo(null)
    setAttach(null)
    setTypers({})
    setAttn(new Set())
    setPlain({})
    setSearchOpen(false)
    setResults(null)
    stickRef.current = true
    ;(async () => {
      const { data } = await supabase.from('messages').select('*').eq(col, val).order('created_at', { ascending: false }).limit(PAGE)
      if (!active || !data) return
      const ordered = data.reverse()
      await ensureAuthors(ordered.map((m) => m.author_id))
      if (!active) return
      setMessages(ordered)
      setHasMore(data.length === PAGE)
      loadExtras(ordered)
    })()

    const loadPins = async () => {
      const { data, error } = await supabase.from('pins').select('message_id').eq(col, val)
      if (active && !error) setPinIds((data || []).map((p) => p.message_id))
    }
    setPinIds([])
    setPinsOpen(false)
    loadPins()

    const ch = supabase
      .channel(`chat-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${col}=eq.${val}` }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          await ensureAuthors([payload.new.author_id])
          const nm = payload.new
          setMessages((prev) => {
            if (prev.some((m) => m.id === nm.id)) return prev
            const twin = nm.author_id === me.id ? prev.findIndex((m) => m._pending && m.content === nm.content && (m.attachment_url || null) === (nm.attachment_url || null)) : -1
            if (twin >= 0) { const next = [...prev]; next[twin] = nm; return next }
            return [...prev, nm]
          })
          if (nm.reply_to && nm.author_id !== me.id) {
            const par = messagesRef.current.find((x) => x.id === nm.reply_to)
            if (par?.author_id === me.id) setAttn((cur) => new Set(cur).add(nm.id))
          }
          setTypers((prev) => {
            if (!prev[payload.new.author_id]) return prev
            const { [payload.new.author_id]: _gone, ...rest } = prev
            return rest
          })
          if (payload.new.reply_to) loadExtras([payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)))
        } else if (payload.eventType === 'DELETE') {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
        const row = payload.new?.message_id ? payload.new : payload.old
        if (!row?.message_id || !messagesRef.current.some((m) => m.id === row.message_id)) return
        const same = (r) => r.message_id === row.message_id && r.user_id === row.user_id && r.kind === row.kind
        if (payload.eventType === 'INSERT') {
          setReactions((prev) => (prev.some(same) ? prev : [...prev, payload.new]))
          const target = messagesRef.current.find((m) => m.id === row.message_id)
          if (target?.author_id === me.id && row.user_id !== me.id) setAttn((cur) => new Set(cur).add(target.id))
        }
        else if (payload.eventType === 'DELETE') setReactions((prev) => prev.filter((r) => !same(r)))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins', filter: `${col}=eq.${val}` }, () => loadPins())
      .on('broadcast', { event: 'gone' }, ({ payload }) => {
        if (payload?.id) setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev.filter((m) => m.id !== payload.id) : prev))
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.id || payload.id === me.id) return
        ensureAuthors([payload.id])
        setTypers((prev) => ({ ...prev, [payload.id]: Date.now() }))
      })
      .subscribe()
    chanRef.current = ch
    return () => {
      active = false
      chanRef.current = null
      supabase.removeChannel(ch)
    }
  }, [key, col, val, me.id, ensureAuthors, loadExtras])

  // expire stale typing indicators
  const someoneTyping = Object.keys(typers).length > 0
  useEffect(() => {
    if (!someoneTyping) return undefined // no timer at all while the chat is quiet
    const t = setInterval(() => {
      setTypers((prev) => {
        const now = Date.now()
        const entries = Object.entries(prev).filter(([, ts]) => now - ts < 4500)
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries)
      })
    }, 1500)
    return () => clearInterval(t)
  }, [someoneTyping])

  useEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, attach, replyTo])

  // Open every sealed message we can (including reply targets that are not on screen)
  useEffect(() => {
    if (!target.dm_id || sess.status !== 'ready') return undefined
    const todo = [...messages, ...Object.values(parents)].filter((m) => isSealed(m.content) && !m._pending && plain[m.id]?.src !== m.content)
    if (!todo.length) return undefined
    let live = true
    ;(async () => {
      const out = {}
      for (const m of todo) {
        try { out[m.id] = { ...(await openSealed(sess.key, target.dm_id, m.author_id, m.content)), src: m.content } } catch { out[m.id] = { err: true, src: m.content } }
      }
      if (live) setPlain((cur) => ({ ...cur, ...out }))
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, parents, sess.status, sess.key, target.dm_id])

  // What a message looks like to this person: its text and its attachment, whether sealed or not.
  const view = useCallback((m) => {
    if (!m) return { text: '', att: null }
    if (!isSealed(m.content)) {
      const kind = !m.attachment_url ? null : isVideoUrl(m.attachment_url) ? 'video' : isAudioUrl(m.attachment_url) ? (isVoiceUrl(m.attachment_url) ? 'voice' : 'audio') : 'image'
      return { text: m.content, att: m.attachment_url ? { url: m.attachment_url, kind } : null }
    }
    const p = plain[m.id]
    if (!p) return { text: '', att: null, locked: sess.status === 'ready' ? 'wait' : 'locked' }
    if (p.err) return { text: '', att: null, locked: 'bad' }
    const mt = (p.a?.m || '').split('/')[0]
    return { text: p.t || '', att: p.a ? { enc: p.a, kind: p.a.v ? 'voice' : mt === 'video' ? 'video' : mt === 'audio' ? 'audio' : 'image' } : null, sealed: true }
  }, [plain, sess.status])
  const viewRef = useRef(view)
  viewRef.current = view

  const clearAttn = useCallback((id) => setAttn((cur) => { if (!cur.has(id)) return cur; const n = new Set(cur); n.delete(id); return n }), [])

  function onScroll() {
    const el = listRef.current
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = near
    setAtBottom((cur) => (cur === near ? cur : near))
  }

  function jumpToBottom() {
    const el = listRef.current
    stickRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  async function loadOlder() {
    const first = messages[0]
    if (!first) return
    const { data } = await supabase.from('messages').select('*').eq(col, val).lt('created_at', first.created_at).order('created_at', { ascending: false }).limit(PAGE)
    if (!data) return
    stickRef.current = false
    await ensureAuthors(data.map((m) => m.author_id))
    const older = data.reverse()
    setMessages((prev) => [...older, ...prev])
    setHasMore(data.length === PAGE)
    loadExtras(older)
  }

  async function attachFile(file) {
    if (!file) return
    setError('')
    setAttach({ busy: true })
    try {
      if (sealedMode) {
        const { type, kind } = checkMedia(file, { video: true })
        const sealedFile = await sealFile(file)
        const url = await uploadSealed(me.id, sealedFile.blob)
        setAttach({ url, kind, local: URL.createObjectURL(file), enc: { k: sealedFile.k, i: sealedFile.i, m: type, n: (file.name || 'file').slice(0, 80) } })
      } else {
        const { kind } = checkMedia(file, { video: true })
        const url = await uploadMedia(me.id, file, 'chat', { video: true })
        setAttach({ url, kind })
      }
    } catch (e) {
      setAttach(null)
      setError(e.message)
    }
  }

  async function sendVoice(file, seconds) {
    setRecording(false)
    setError('')
    try {
      if (sealedMode) {
        const sealedFile = await sealFile(file)
        const url = await uploadSealed(me.id, sealedFile.blob)
        await send(null, { url, kind: 'audio', voice: true, seconds, enc: { k: sealedFile.k, i: sealedFile.i, m: file.type || 'audio/webm', n: 'Voice message' } })
      } else {
        const url = await uploadMedia(me.id, file, 'voice', { video: true, seconds })
        await send(null, { url, kind: 'audio' })
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function send(e, forced) {
    e?.preventDefault()
    const content = forced ? '' : replaceShortcodes(encodeCustom(text.trim(), { prefer: groupId, picked: pickedRef.current }))
    const att = forced || attach
    if (content.length > 2000) return setError('That message is too long once its custom emoji are counted. Remove a few.')
    if (!forced && rules?.slowmode && !isFounder) {
      const left = Math.ceil((lastSent.current + rules.slowmode * 1000 - Date.now()) / 1000)
      if (left > 0) return setError(`Slowmode is on. You can send again in ${left}s.`)
    }
    lastSent.current = Date.now()
    if ((!content && !att?.url) || (!forced && attach?.busy)) return
    if (target.dm_id && sess.status === 'checking') return setError('One moment, checking this chat\'s encryption…')
    if (target.dm_id && sess.status === 'locked') { requestE2eeDialog('unlock'); return setError('Unlock encryption to send messages in this chat.') }
    let payload
    let entry = null
    if (sealedMode) {
      const obj = { t: content }
      if (att?.url) obj.a = att.enc ? { u: att.url, ...att.enc, v: att.voice ? 1 : 0, d: Math.round(att.seconds || 0) } : { u: att.url, plain: 1, m: att.kind === 'video' ? 'video/mp4' : att.kind === 'audio' ? 'audio/mpeg' : 'image/png', n: 'Attachment' }
      const sealedText = await seal(sess.key, val, me.id, obj)
      payload = { dm_id: val, author_id: me.id, content: sealedText, attachment_url: null, reply_to: replyTo?.id || null }
      entry = { ...obj, src: sealedText }
    } else {
      payload = { [col]: val, author_id: me.id, content, attachment_url: att?.url || null, reply_to: replyTo?.id || null }
    }
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    // Show it straight away; it settles when the server confirms.
    setMessages((prev) => [...prev, { ...payload, id: tmpId, created_at: new Date().toISOString(), _pending: true }])
    if (entry) setPlain((cur) => ({ ...cur, [tmpId]: entry }))
    if (!forced) { setText(''); setAttach(null) }
    setReplyTo(null)
    setError('')
    stickRef.current = true
    const { data, error } = await supabase.from('messages').insert(payload).select().single()
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId))
      setError(error.message)
      if (!forced) {
        setText(content)
        if (att?.url) setAttach(att)
      }
    } else if (data) {
      if (entry) setPlain((cur) => ({ ...cur, [data.id]: entry }))
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev.filter((m) => m.id !== tmpId)
        return prev.map((m) => (m.id === tmpId ? data : m))
      })
    }
  }

  // Everyone you can @ here: the people in this group, or the other person in a DM.
  const people = useMemo(() => {
    const list = members ? members.map((m) => m.profile).filter(Boolean) : peopleList || Object.values(authors)
    const seen = new Set()
    return list.filter((p) => p?.username && !seen.has(p.id) && seen.add(p.id))
  }, [members, authors, peopleList])
  const byName = useMemo(() => new Map(people.map((p) => [p.username.toLowerCase(), p])), [people])
  const canEveryone = (authorId) => {
    const m = members?.find((x) => x.user_id === authorId)
    return Boolean(m && (m.role === 'founder' || m.perms?.includes('messages')))
  }

  function pickMention(item) {
    const el = inputRef.current
    if (!men || !el) return
    const caret = el.selectionStart
    const str = `@${item.name} `
    setText(`${text.slice(0, men.start)}${str}${text.slice(caret)}`)
    setMen(null)
    const pos = men.start + str.length
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  function insertAtCaret(str) {
    const el = inputRef.current
    const a = el ? el.selectionStart : text.length
    const b = el ? el.selectionEnd : text.length
    const next = `${text.slice(0, a)}${str}${text.slice(b)}`
    if (next.length > 2000) return
    setText(next)
    const pos = a + str.length
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos) })
  }

  function pickEmoji(item) {
    const el = inputRef.current
    if (!emo || !el) return
    const caret = el.selectionStart
    const str = item.custom ? `:${item.custom.name}: ` : `${item.char} `
    if (item.custom) pickedRef.current.set(item.custom.name, item.custom.id)
    setText(`${text.slice(0, emo.start)}${str}${text.slice(caret)}`)
    setEmo(null)
    const pos = emo.start + str.length
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  function pickFromPicker(it) {
    if (it.id) { pickedRef.current.set(it.name, it.id); insertAtCaret(`:${it.name}: `) } else insertAtCaret(it.c)
    setEmojiOpen(false)
  }

  function onChangeText(e) {
    let value = e.target.value
    const caret = e.target.selectionStart
    const mo = value.includes('@') ? openMention(value, caret) : null
    if (mo) {
      const q = mo.query
      const list = people.filter((p) => p.id !== me.id || true).filter((p) => !q || p.username.toLowerCase().startsWith(q) || (p.display_name || '').toLowerCase().startsWith(q)).slice(0, 6).map((p) => ({ name: p.username, profile: p }))
      if (members && isFounder) for (const k of ['everyone', 'here']) if (k.startsWith(q)) list.push({ name: k, special: true })
      setMen(list.length ? { start: mo.start, list: list.slice(0, 7), i: 0 } : null)
    } else if (men) setMen(null)
    if (value.includes(':')) {
      loadEmoji().then(() => {
        const el = inputRef.current
        if (!el) return
        const open = openShortcode(el.value, el.selectionStart)
        const list = open ? [...searchCustom(open.query, 4).map((e) => [e.name, null, e]), ...searchEmoji(open.query)].slice(0, 8) : []
        setEmo(list.length ? { start: open.start, list, i: 0 } : null)
      })
      // ":smile:" turns into the emoji the moment the closing colon is typed
      const done = /:([a-z0-9_+-]{1,40}):$/i.exec(value.slice(0, caret))
      const swapped = done && replaceShortcodes(done[0])
      if (swapped && swapped !== done[0]) {
        value = value.slice(0, caret - done[0].length) + swapped + value.slice(caret)
        const pos = caret - done[0].length + swapped.length
        requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos))
        setEmo(null)
      }
    } else if (emo) setEmo(null)
    setText(value)
    const now = Date.now()
    if (e.target.value && now - lastTyping.current > 2500 && chanRef.current) {
      lastTyping.current = now
      chanRef.current.send({ type: 'broadcast', event: 'typing', payload: { id: me.id } })
    }
  }

  function onKey(e) {
    if (men) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = men.list.length; return setMen({ ...men, i: (men.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n }) }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickMention(men.list[men.i]) }
      if (e.key === 'Escape') { e.preventDefault(); return setMen(null) }
    }
    if (emo) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = emo.list.length
        return setEmo({ ...emo, i: (emo.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n })
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        { const [, ch, cu] = emo.list[emo.i]; return pickEmoji(cu ? { custom: cu } : { char: ch }) }
      }
      if (e.key === 'Escape') { e.preventDefault(); return setEmo(null) }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e)
    else if (e.key === 'Escape') setReplyTo(null)
    else if (e.key === 'ArrowUp' && !text) {
      const mine = [...messages].reverse().find((m) => m.author_id === me.id && viewRef.current(m).text)
      if (mine) {
        setEditing(mine.id)
        setEditText(decodeCustom(viewRef.current(mine).text, pickedRef.current))
      }
    }
  }

  function onPaste(e) {
    const f = [...(e.clipboardData?.files || [])].find((x) => /^(image|video|audio)\//.test(x.type))
    if (f) {
      e.preventDefault()
      attachFile(f)
    }
  }

  async function saveEdit(id) {
    const content = replaceShortcodes(encodeCustom(editText.trim(), { prefer: groupId, picked: pickedRef.current }))
    if (!content) return
    const before = messagesRef.current.find((m) => m.id === id)
    const v = view(before)
    if (before && v.text === content) return setEditing(null)
    const stamp = new Date().toISOString()
    let stored = content
    let entry = null
    if (isSealed(before?.content)) {
      if (sess.status !== 'ready') return setError('Unlock encryption to edit this message.')
      const p = plain[id]
      const obj = { ...(p?.a ? { a: p.a } : {}), t: content }
      stored = await seal(sess.key, val, me.id, obj)
      entry = { ...obj, src: stored }
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: stored, edited_at: stamp } : m)))
    if (entry) setPlain((cur) => ({ ...cur, [id]: entry }))
    setEditing(null)
    const { error } = await supabase.from('messages').update({ content: stored, edited_at: stamp }).eq('id', id)
    if (error) {
      setMessages((prev) => prev.map((m) => (m.id === id ? before : m)))
      setError(error.message)
    }
  }

  // Deleting is instant for everyone: it is removed here at once, deleted on the server straight away and
  // announced to everyone looking at the chat. Undo puts the message back if you change your mind.
  function remove(m) {
    setLeaving((cur) => new Set(cur).add(m.id))
    setTimeout(() => setMessages((prev) => prev.filter((x) => x.id !== m.id)), 170)
    const stopLeaving = () => setLeaving((cur) => { const n = new Set(cur); n.delete(m.id); return n })
    const restore = () => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))))
    ;(async () => {
      const { error } = await supabase.from('messages').delete().eq('id', m.id)
      if (error) { notify(error.message, 'error'); stopLeaving(); restore(); return }
      chanRef.current?.send({ type: 'broadcast', event: 'gone', payload: { id: m.id } })
    })()
    notify('Message deleted', 'info', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          const row = Object.fromEntries(Object.entries(m).filter(([k, v]) => !k.startsWith('_') && v !== null && v !== undefined))
          const { error } = await supabase.from('messages').insert(row)
          stopLeaving()
          if (error) return notify("Couldn't restore that message.", 'error')
          restore()
        },
      },
    })
  }

  async function report(m) {
    const v = view(m)
    const r = await reportDialog({
      title: 'Report this message',
      body: v.sealed ? 'This message is end-to-end encrypted. Sending a report shares its text with the Nook team so they can review it.' : 'Tell us what is wrong so we can look into it.',
    })
    if (!r) return
    const row = {
      reporter: me.id,
      message_id: m.id,
      reported_user: m.author_id,
      reason: (r.reason || r.category).slice(0, 500),
      message_snapshot: v.text || (v.att ? `[${v.att.kind}]` : '[attachment]'),
      category: r.category,
    }
    let { error } = await supabase.from('reports').insert(row)
    if (error && /category/i.test(error.message)) ({ error } = await supabase.from('reports').insert({ ...row, category: undefined }))
    notify(error ? error.message : 'Thanks, your report was sent.', error ? 'error' : 'info')
  }

  async function toggleReact(m, kind) {
    setPicker(null)
    setReactFull(null)
    const same = (r) => r.message_id === m.id && r.user_id === me.id && kindOf(r.kind) === kind
    const have = reactions.find(same)
    if (have) {
      setReactions((prev) => prev.filter((r) => !same(r)))
      await supabase.from('reactions').delete().match({ message_id: m.id, user_id: me.id, kind: have.kind })
    } else {
      const row = { message_id: m.id, user_id: me.id, kind }
      setReactions((prev) => [...prev, row])
      const { error } = await supabase.from('reactions').insert(row)
      if (error) {
        setReactions((prev) => prev.filter((r) => !(r.message_id === m.id && r.user_id === me.id && r.kind === kind)))
        notify(/check constraint|reactions_kind/i.test(error.message) ? 'Reactions with any emoji need the latest database update (update_v21.sql).' : error.message, 'error')
      }
    }
  }

  async function togglePin(m) {
    const pinned = pinIds.includes(m.id)
    setPinIds((cur) => (pinned ? cur.filter((x) => x !== m.id) : [...cur, m.id]))
    const { error } = await supabase.rpc('set_pin', { mid: m.id, pin: !pinned })
    if (error) {
      setPinIds((cur) => (pinned ? [...cur, m.id] : cur.filter((x) => x !== m.id)))
      notify(/function|schema/i.test(error.message) ? 'Pins need the latest database update (update_v21.sql).' : error.message, 'error')
    }
  }

  // Scroll to a message, first loading the gap of older messages if it is further back than what is on screen.
  async function reveal(r) {
    if (goTo(r.id)) return true
    const first = messagesRef.current[0]
    if (!first || new Date(r.created_at) >= new Date(first.created_at)) return false
    const { data } = await supabase.from('messages').select('*').eq(col, val).gte('created_at', r.created_at).lt('created_at', first.created_at).order('created_at', { ascending: true }).limit(500)
    if (!data?.length) return false
    await ensureAuthors(data.map((m) => m.author_id))
    setMessages((prev) => { const have = new Set(prev.map((m) => m.id)); return [...data.filter((m) => !have.has(m.id)), ...prev] })
    loadExtras(data)
    await new Promise((res) => setTimeout(res, 120))
    return goTo(r.id)
  }
  useEffect(() => {
    const j = jump.pending
    if (!j || !messages.length || j.channel_id !== val) return
    jump.pending = null
    reveal(j)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length === 0, val])

  async function runSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return setResults(null)
    // Whole group: the server searches every channel you are in. (Direct messages are encrypted, so they are searched here.)
    if (scope === 'group' && groupId) {
      const { data, error } = await supabase.rpc('search_messages', { q, gid: groupId, lim: 40 })
      if (error) { notify(/function|schema/i.test(error.message) ? 'Searching the whole group needs the latest database update (update_v21.sql).' : error.message, 'error'); return }
      const rows = data || []
      await ensureAuthors(rows.map((m) => m.author_id))
      return setResults(rows)
    }
    const esc = q.replace(/[%_\\]/g, (c) => `\\${c}`)
    const { data } = await supabase.from('messages').select('*').eq(col, val).ilike('content', `%${esc}%`).order('created_at', { ascending: false }).limit(30)
    // Sealed messages cannot be searched by the server, so look through the ones already open on this screen.
    const low = q.toLowerCase()
    const local = sealedMode ? [...messages].reverse().filter((m) => isSealed(m.content) && view(m).text.toLowerCase().includes(low)).slice(0, 30) : []
    const found = [...(data || []), ...local].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i && !isSealed(m.content) || local.includes(m))
    await ensureAuthors(found.map((m) => m.author_id))
    setResults(found)
  }

  async function openResult(r) {
    if (r.channel_id && r.channel_id !== val) {
      if (!onJumpChannel) return
      jump.pending = { id: r.id, created_at: r.created_at, channel_id: r.channel_id }
      setSearchOpen(false)
      onJumpChannel(r.channel_id)
      return
    }
    if (await reveal(r)) setSearchOpen(false)
    else notify('That message could not be reached. Try scrolling up and pressing "Load older messages".', 'error')
  }

  function goTo(id) {
    const el = document.getElementById(`m-${id}`)
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('flash')
    setTimeout(() => el.classList.remove('flash'), 1400)
    return true
  }

  const rows = useMemo(() => {
    const byMsg = {}
    for (const r of reactions) (byMsg[r.message_id] ||= []).push(r)
    const index = Object.fromEntries(messages.map((m) => [m.id, m]))
    const out = []
    messages.forEach((m, i) => {
      const prev = messages[i - 1]
      const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
      if (newDay) out.push(<div className="day-sep" key={`d-${m.id}`}><span>{dayLabel(m.created_at)}</span></div>)
      const a = authors[m.author_id]
      const grouped = !newDay && prev.author_id === m.author_id && !m.reply_to && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000
      const mine = m.author_id === me.id
      const parent = m.reply_to ? index[m.reply_to] || parents[m.reply_to] : null
      const pa = parent && authors[parent.author_id]
      const v = view(m)
      const pv = parent ? view(parent) : null
      const counts = {}
      const forMe = Boolean(parent && parent.author_id === me.id && !mine)
      const loved = mine && (byMsg[m.id] || []).some((r) => r.user_id !== me.id)
      for (const r of byMsg[m.id] || []) {
        const k = kindOf(r.kind)
        counts[k] ||= { n: 0, mine: false, who: [] }
        counts[k].n++
        if (r.user_id === me.id) counts[k].mine = true
        else if (counts[k].who.length < 6) counts[k].who.push(authors[r.user_id]?.display_name || authors[r.user_id]?.username || 'Someone')
      }
      out.push(
        <div
          key={m.id}
          id={`m-${m.id}`}
          className={`msg ${grouped ? 'grouped' : ''} ${m._pending ? 'pending' : ''} ${leaving.has(m.id) ? 'leaving' : ''} ${forMe ? 'for-me' : ''} ${loved ? 'loved' : ''} ${attn.has(m.id) ? 'attn' : ''} ${!mine && v.text && mentionsMe(v.text, myName, canEveryone(m.author_id)) ? 'mention-me' : ''}`}
          onPointerEnter={attn.has(m.id) ? () => clearAttn(m.id) : undefined}
          onContextMenu={m._pending ? undefined : (e) => openContext(e, [
            { label: 'Reply', icon: 'reply', onClick: () => { setReplyTo(m); inputRef.current?.focus() } },
            { label: 'Add reaction', icon: 'heart', onClick: () => toggleReact(m, 'heart') },
            v.text && { label: 'Copy text', icon: 'copy', onClick: () => navigator.clipboard?.writeText(v.text).then(() => notify('Copied.'), () => notify('Could not copy.', 'error')) },
            (mine || isFounder || (mine && v.text)) && 'sep',
            mine && v.text && { label: 'Edit message', icon: 'pencil', onClick: () => { setEditing(m.id); setEditText(decodeCustom(v.text, pickedRef.current)) } },
            (mine || isFounder) && { label: 'Delete message', icon: 'trash', danger: true, onClick: () => remove(m) },
            !mine && { label: 'Report message', icon: 'flag', danger: true, onClick: () => report(m) },
          ])}
        >
          <div className="msg-avatar">
            {!grouped ? (
              <button className="plain" onClick={() => a && onOpenProfile(a)}><Avatar profile={a} size={34} /></button>
            ) : (
              <span className="hover-time">{fmtTime(m.created_at)}</span>
            )}
          </div>
          <div className="msg-body">
            {m.reply_to && (
              <button className="quote" onClick={() => parent && goTo(parent.id)}>
                <Icon name="reply" size={12} />
                {parent ? (
                  <>
                    <strong>{pa ? <Name profile={pa} /> : '…'}</strong>
                    <span className="ellipsis">{(pv.text && decodeCustom(pv.text)) || (pv.locked ? 'Encrypted message' : pv.att ? { video: 'Video', audio: 'Audio', voice: 'Voice message' }[pv.att.kind] || 'Image' : kindLabel(parent.attachment_url))}</span>
                  </>
                ) : (
                  <span className="muted">Original message unavailable</span>
                )}
              </button>
            )}
            {!grouped && (
              <div className="msg-meta">
                <button className="plain name" onClick={() => a && onOpenProfile(a)}>
                  {a ? <Name profile={a} /> : '…'}
                </button>
                {a && <BadgeRow profile={a} size={17} max={3} />}
                <span className="muted tiny">{fmtTime(m.created_at)}</span>
                {pinIds.includes(m.id) && <span className="pin-flag" title="Pinned"><Icon name="pin" size={11} /> Pinned</span>}
              </div>
            )}
            {editing === m.id ? (
              <div className="edit-box">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id) } else if (e.key === 'Escape') setEditing(null) }} maxLength={2000} rows={2} autoFocus />
                <div className="row">
                  <button className="primary small" onClick={() => saveEdit(m.id)}>Save</button>
                  <button className="ghost small" onClick={() => setEditing(null)}>Cancel</button>
                  <span className="hint">Enter to save, Esc to cancel</span>
                </div>
              </div>
            ) : (
              v.locked ? (
                <div className={`msg-text msg-locked ${v.locked}`}>
                  <Icon name="lock" size={13} />{' '}
                  {v.locked === 'wait' ? 'Decrypting…' : v.locked === 'bad' ? 'This message cannot be decrypted. It may have been sent before encryption was reset.' : 'Encrypted message. Unlock encryption to read it.'}
                  {v.locked !== 'wait' && v.locked !== 'bad' && <button type="button" className="inline-link" onClick={() => requestE2eeDialog('unlock')}>Unlock</button>}
                </div>
              ) : (
                v.text && (
                  <div className="msg-text">
                    {renderText(v.text, { byName, me: me.id, open: onOpenProfile, everyoneOk: canEveryone(m.author_id) })}
                    {m.edited_at && <span className="muted tiny"> (edited)</span>}
                  </div>
                )
              )
            )}
            {v.att?.enc && <SealedAttach a={v.att.enc} onLoad={() => { const el = listRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight }} onOpenImage={setLightbox} />}
            {v.att?.url && (v.att.kind === 'video' ? (
              <div className="attach attach-video"><Suspense fallback={<div className="vp vp-skel" />}><VideoPlayer src={v.att.url} onReady={() => { const el = listRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight }} /></Suspense></div>
            ) : v.att.kind === 'audio' || v.att.kind === 'voice' ? (
              <div className="attach attach-audio"><AudioPlayer src={v.att.url} /></div>
            ) : (
              <button className="attach" onClick={() => setLightbox(v.att.url)} aria-label="Open image">
                <img src={v.att.url} alt="Attached" loading="lazy" decoding="async" draggable="false" onLoad={() => { const el = listRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight }} />
              </button>
            ))}
            {Object.keys(counts).length > 0 && (
              <div className="chips">
                {Object.keys(counts).map((k) => (
                  <button key={k} className={`chip rx ${counts[k].mine ? 'mine' : ''}`} onClick={() => toggleReact(m, k)} title={[counts[k].mine ? 'You' : null, ...counts[k].who].filter(Boolean).join(', ')} aria-pressed={counts[k].mine}>
                    <ReactionFace kind={k} /> <span className="rx-n">{counts[k].n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {editing !== m.id && !m._pending && (
            <div className="msg-tools">
              <button title="React" onClick={() => setPicker(picker === m.id ? null : m.id)}><Icon name="smileplus" size={14} /></button>
              <button title="Reply" onClick={() => { setReplyTo(m); inputRef.current?.focus() }}><Icon name="reply" size={14} /></button>
              {canPin && <button title={pinIds.includes(m.id) ? 'Unpin' : 'Pin'} aria-label={pinIds.includes(m.id) ? 'Unpin message' : 'Pin message'} onClick={() => togglePin(m)}><Icon name="pin" size={14} /></button>}
              {mine && v.text && <button title="Edit" onClick={() => { setEditing(m.id); setEditText(decodeCustom(v.text, pickedRef.current)) }}><Icon name="pencil" size={14} /></button>}
              {(mine || isFounder) && <button title="Delete" onClick={() => remove(m)}><Icon name="trash" size={14} /></button>}
              {!mine && <button title="Report" onClick={() => report(m)}><Icon name="flag" size={14} /></button>}
              {picker === m.id && (
                <div className="picker">
                  {QUICK.map((k) => (
                    <button key={k} className="rx-quick" onClick={() => toggleReact(m, k)} title={k} aria-label={`React with ${k}`}>{k}</button>
                  ))}
                  <button className="rx-more" title="More emoji" aria-label="More emoji" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPicker(null); setReactFull({ id: m.id, x: r.right, y: r.bottom }) }}><Icon name="plus" size={16} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      )
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, authors, parents, reactions, editing, editText, picker, me.id, isFounder, attn, leaving, view, sess.status, byName, myName, members, pinIds])

  const typingNames = Object.keys(typers).map((id) => authors[id]?.display_name || authors[id]?.username).filter(Boolean)
  const replyAuthor = replyTo && authors[replyTo.author_id]

  return (
    <section
      className={`chat ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); attachFile(e.dataTransfer?.files?.[0]) }}
    >
      <header className="chat-head">
        <button className="icon-btn only-mobile" onClick={onMenu} aria-label="Open menu"><Icon name="menu" size={18} /></button>
        <div className="chat-title">
          {lead}
          <strong>{title}</strong>
          {onEditTopic ? (
            <button className="topic-btn muted ellipsis" onClick={onEditTopic} title="Edit topic">{subtitle || 'Add a topic'}</button>
          ) : subtitle && <span className="subtitle muted ellipsis">{subtitle}</span>}
        </div>
        <div className="head-actions">
          {target.dm_id && !['off', 'unavailable', 'unsupported', 'checking'].includes(sess.status) && (
            <button className={`icon-btn enc-btn ${sealedMode ? 'on' : ''}`} onClick={() => (sealedMode ? setSafetyOpen(true) : sess.status === 'locked' ? requestE2eeDialog('unlock') : notify(`${title} has not turned on encryption yet, so this chat is not end-to-end encrypted.`))} title={sealedMode ? 'End-to-end encrypted. Click to verify.' : 'Not end-to-end encrypted'} aria-label={sealedMode ? 'End-to-end encrypted' : 'Not end-to-end encrypted'}>
              <Icon name={sealedMode ? 'lock' : 'unlock'} size={17} />
            </button>
          )}
          <button className={`icon-btn ${pinsOpen ? 'active' : ''}`} title="Pinned messages" aria-label="Pinned messages" aria-expanded={pinsOpen} onClick={() => setPinsOpen((v) => !v)}>
            <Icon name="pin" size={17} />{pinIds.length > 0 && <span className="pin-count">{pinIds.length}</span>}
          </button>
          <NotifBell userId={me.id} target={val} kind={target.dm_id ? 'dm' : 'channel'} groupId={target.dm_id ? null : groupId} />
          <button className={`icon-btn ${searchOpen ? 'active' : ''}`} title="Search messages" onClick={() => { setSearchOpen((v) => !v); setResults(null); setQuery('') }}><Icon name="search" size={17} /></button>
          {headerExtra}
        </div>
      </header>

      {target.dm_id && sess.status === 'ready' && sess.changed && (
        <div className="enc-notice warn" role="alert">
          <Icon name="alert" size={15} /><span>{title}'s encryption key changed. They may have reset it or be using a new device. Check their safety number before sharing anything sensitive.</span>
          <button className="ghost small" onClick={() => setSafetyOpen(true)}>Check</button>
        </div>
      )}
      {target.dm_id && sess.status === 'locked' && (
        <div className="enc-notice">
          <Icon name="lock" size={15} /><span>Your messages are locked on this device.</span>
          <button className="primary small" onClick={() => requestE2eeDialog('unlock')}>Unlock</button>
        </div>
      )}
      {target.dm_id && sess.status === 'no-peer' && !sessionStorage.getItem('nook-enc-peer-' + target.dm_id) && (
        <div className="enc-notice subtle">
          <Icon name="unlock" size={15} /><span>{title} has not opened Nook since encryption became automatic, so messages here are not end-to-end encrypted yet. They will be as soon as they do.</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => { sessionStorage.setItem('nook-enc-peer-' + target.dm_id, '1'); setPlain((p) => ({ ...p })) }}><Icon name="x" size={14} /></button>
        </div>
      )}
      {searchOpen && (
        <div className="searchbar">
          <form onSubmit={runSearch} className="row nowrap">
            <input autoFocus placeholder={scope === 'group' ? 'Search every channel in this group' : 'Search this conversation'} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search messages" />
            <button className="ghost">Search</button>
          </form>
          {groupId && !target.dm_id && (
            <div className="scope" role="radiogroup" aria-label="Search where">
              <button type="button" role="radio" aria-checked={scope === 'channel'} className={scope === 'channel' ? 'on' : ''} onClick={() => { setScope('channel'); setResults(null) }}>This channel</button>
              <button type="button" role="radio" aria-checked={scope === 'group'} className={scope === 'group' ? 'on' : ''} onClick={() => { setScope('group'); setResults(null) }}>Whole group</button>
            </div>
          )}
          {results && (
            <div className="results">
              {results.length === 0 && <div className="muted small pad">No matches.</div>}
              {results.map((r) => {
                const ra = authors[r.author_id]
                return (
                  <button key={r.id} className="result" onClick={() => openResult(r)}>
                    {r.channel_name && <span className="rchan">#{r.channel_name}</span>}
                    <strong>{ra ? <Name profile={ra} /> : ''}</strong>
                    <span className="muted tiny">{new Date(r.created_at).toLocaleString()}</span>
                    <span className="ellipsis">{decodeCustom(view(r).text || "")}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {pinsOpen && <PinsPanel col={col} val={val} ids={pinIds} view={view} authors={authors} ensureAuthors={ensureAuthors} canPin={canPin} onJump={(m) => reveal(m)} onUnpin={togglePin} onClose={() => setPinsOpen(false)} />}

      <div className="messages" ref={listRef} onScroll={onScroll} onClick={() => picker && setPicker(null)}>
        {hasMore && <button className="link center" onClick={loadOlder}>Load older messages</button>}
        {messages.length === 0 && (
          <div className="empty"><Mascot mood="wink" size={80} animated /><span>This is the start of the conversation. Say hi!</span></div>
        )}
        {rows}
      </div>

      {!atBottom && (
        <button className="jump" onClick={jumpToBottom}><Icon name="arrowdown" size={14} /> Latest</button>
      )}

      <div className="typing" aria-live="polite">
        {typingNames.length > 0 && (
          <>
            <span className="dots"><i /><i /><i /></span>
            {typingNames.slice(0, 3).join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing
          </>
        )}
      </div>

      {error && <div className="error inline">{error}</div>}

      {replyTo && (
        <div className="replybar">
          <Icon name="reply" size={14} />
          <span className="ellipsis">Replying to <strong>{replyAuthor?.display_name || replyAuthor?.username}</strong>: {(view(replyTo).text && decodeCustom(view(replyTo).text)) || (view(replyTo).locked ? 'Encrypted message' : kindLabel(replyTo.attachment_url))}</span>
          <button className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Icon name="x" size={14} /></button>
        </div>
      )}
      {attach && (
        <div className="attach-preview">
          {attach.busy ? <span className="muted small">{sealedMode ? 'Encrypting and uploading…' : 'Uploading…'}</span> : attach.kind === 'audio' ? <span className="muted small"><Icon name="volume" size={15} /> {attach.enc?.n || audioInfo(attach.url).title || 'Audio file'}</span> : attach.kind === 'video' ? <video src={`${attach.local || attach.url}#t=0.1`} muted playsInline preload="metadata" /> : <img src={attach.local || attach.url} alt="To send" />}
          {!attach.busy && <button className="icon-btn" onClick={() => setAttach(null)} aria-label="Remove attachment"><Icon name="x" size={14} /></button>}
        </div>
      )}

      <div className="composer-wrap">
      {emo && (
        <div className="emoji-pop" role="listbox" aria-label="Emoji suggestions">
          {emo.list.map(([n, c, cu], i) => (
            <button key={cu ? cu.id : n} type="button" role="option" aria-selected={i === emo.i} className={i === emo.i ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickEmoji(cu ? { custom: cu } : { char: c }) }} onMouseEnter={() => setEmo((x) => x && { ...x, i })}>
              <span className="e">{cu ? <img className="cemoji" src={cu.url} alt="" /> : c}</span><span className="ellipsis">:{n}:</span>
            </button>
          ))}
        </div>
      )}
      {men && (
        <div className="mention-pop" role="listbox" aria-label="Mention someone">
          {men.list.map((it, i) => (
            <button key={it.name} type="button" role="option" aria-selected={i === men.i} className={i === men.i ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickMention(it) }} onMouseEnter={() => setMen((x) => x && { ...x, i })}>
              {it.profile ? <Avatar profile={it.profile} size={22} /> : <span className="chan-glyph"><Icon name="megaphone" size={15} /></span>}
              <span className="ellipsis">{it.profile ? (it.profile.display_name || it.profile.username) : `@${it.name}`}</span>
              <span className="sub ellipsis">{it.profile ? `@${it.name}` : it.name === 'everyone' ? 'Notify everyone' : 'Notify people here'}</span>
            </button>
          ))}
        </div>
      )}
      {reactFull && (
        <div className="react-pop" style={{ left: Math.max(8, Math.min(reactFull.x - 360, window.innerWidth - 368)), top: Math.max(8, Math.min(reactFull.y + 6, window.innerHeight - 392)) }}>
          <Suspense fallback={null}><EmojiPicker onPick={(it) => { const m = messages.find((x) => x.id === reactFull.id); if (m) toggleReact(m, it.id ? `<e:${it.id}:${it.name}>` : it.c); setReactFull(null) }} onClose={() => setReactFull(null)} /></Suspense>
        </div>
      )}
      {emojiOpen && <Suspense fallback={null}><EmojiPicker onPick={pickFromPicker} onClose={() => setEmojiOpen(false)} /></Suspense>}
      {locked ? (
        <div className="composer locked"><Icon name="lock" size={15} /><span>Only moderators can post in this channel.</span></div>
      ) : recording ? (
        <Suspense fallback={<div className="composer recording" />}>
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} onError={(m) => setError(m)} />
        </Suspense>
      ) : (
      <form className="composer" onSubmit={send}>
        <input id="file-in" type="file" accept={ACCEPT_MEDIA} hidden onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = '' }} />
        <label htmlFor="file-in" className="icon-btn attach-btn" title="Attach an image, video or audio file"><Icon name="image" size={18} /></label>
        <textarea
          ref={inputRef}
          value={text}
          onChange={onChangeText}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={sealedMode ? `Encrypted message to ${title}` : `Message ${target.channel_id ? '#' : ''}${title}`}
          rows={1}
          maxLength={2000}
        />
        <button type="button" data-emoji-btn className={`icon-btn attach-btn ${emojiOpen ? 'on' : ''}`} onPointerEnter={() => { loadEmoji() }} onClick={() => setEmojiOpen((o) => !o)} title="Emoji" aria-label="Emoji" aria-expanded={emojiOpen}><Icon name="smileplus" size={18} /></button>
        {!text.trim() && !attach && <button type="button" className="icon-btn attach-btn" onClick={() => setRecording(true)} title="Record a voice message" aria-label="Record a voice message"><Icon name="mic" size={18} /></button>}
        <button className="send" disabled={(!text.trim() && !attach?.url) || attach?.busy} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
      )}
      </div>

      {dragging && <div className="drop-hint"><Icon name="upload" size={28} />Drop an image, video or audio file to attach</div>}

      {safetyOpen && sess.safety && (
        <Suspense fallback={null}>
          <SafetyDialog name={title} safety={sess.safety} changed={sess.changed} onAccept={() => { repin(otherId, sess.peerKid); sess.refresh(); setSafetyOpen(false) }} onClose={() => setSafetyOpen(false)} />
        </Suspense>
      )}
      {lightbox && (
        <div className="overlay lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full size" />
          <button className="icon-btn light" aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
      )}
    </section>
  )
}
