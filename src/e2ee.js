import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

/*
  End-to-end encryption for direct messages.

  - Everyone has an ECDH P-256 key pair. The public key is stored in `user_keys`.
  - The private key is also stored in `key_backups`, but only after being locked with a passphrase that never leaves
    the browser (PBKDF2 then AES-GCM). Nook cannot read it. A device that has unlocked it keeps a non-extractable copy.
  - Two people derive the same secret from their key pairs (ECDH), turned into an AES-GCM key per conversation (HKDF).
  - Each message is sealed as "e1.<iv>.<ciphertext>". The text and any attachment details live inside, and attachments
    are uploaded already encrypted, so the server only ever sees scrambled bytes.
  - Group chats are not end-to-end encrypted. They are encrypted in transit and at rest only.
*/

const te = new TextEncoder()
const td = new TextDecoder()
const ITERS = 600000
export const SEALED = 'e1.'
export const isSealed = (c) => typeof c === 'string' && c.startsWith(SEALED)
export const canCrypto = typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined'

/* ---------- encoding ---------- */
export function b64(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function unb64(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const rand = (n) => crypto.getRandomValues(new Uint8Array(n))
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
const canon = (jwk) => `${jwk.x}.${jwk.y}`
const cleanJwk = (j) => ({ kty: j.kty, crv: j.crv, x: j.x, y: j.y })
async function kidOf(jwk) {
  return hex(await crypto.subtle.digest('SHA-256', te.encode(canon(jwk)))).slice(0, 16)
}

/* ---------- tiny IndexedDB key store (CryptoKey objects can be stored, but not read as bytes) ---------- */
let dbp
function db() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('nook-e2ee', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('keys')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  return dbp
}
async function idb(mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction('keys', mode)
    const req = fn(tx.objectStore('keys'))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}
const idbGet = (k) => idb('readonly', (s) => s.get(k))
const idbSet = (k, v) => idb('readwrite', (s) => s.put(v, k))
const idbDel = (k) => idb('readwrite', (s) => s.delete(k))

/* ---------- state ---------- */
// status: loading | none (no keys yet) | locked (keys exist, not on this device) | ready | unavailable (database not updated) | unsupported
let state = { status: 'loading', kid: null, userId: null, dialog: null, mode: 'auto' }
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const patch = (p) => { state = { ...state, ...p }; emit() }
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
export const useE2ee = () => useSyncExternalStore(subscribe, () => state)
export const e2eeState = () => state
export const requestE2eeDialog = (dialog) => patch({ dialog })

let priv = null // non-extractable private key for the signed-in person
let myPub = null

let authHooked = false
export async function initKeys(userId) {
  if (!canCrypto) return patch({ status: 'unsupported', userId })
  patch({ status: 'loading', userId })
  if (!authHooked) {
    authHooked = true
    // Signing out wipes the key from this browser, so the next person on a shared computer cannot use it.
    supabase.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        priv = null; myPub = null; sessions.clear(); peers.clear()
        idb('readwrite', (s) => s.clear()).catch(() => {})
        patch({ status: 'loading', kid: null, mode: 'auto' })
      }
    })
  }
  try {
    const [{ data, error }, sec] = await Promise.all([
      supabase.from('user_keys').select('public_key, kid').eq('user_id', userId).maybeSingle(),
      supabase.from('key_secrets').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    if (error) { priv = null; return patch({ status: 'unavailable' }) }
    const mode = sec?.data ? 'auto' : 'passphrase'
    const localPriv = await idbGet(`priv:${userId}`)
    const localKid = await idbGet(`kid:${userId}`)
    if (!data) {
      if (localPriv) { await idbDel(`priv:${userId}`); await idbDel(`kid:${userId}`) }
      priv = null
      myPub = null
      // Nobody has keys yet: make them now, silently. Always on.
      try {
        await setupKeys(userId, null, { create: true })
        return undefined
      } catch (e) {
        if (e.code === 'raced') return initKeys(userId)
        return patch({ status: 'unavailable' })
      }
    }
    myPub = JSON.parse(data.public_key)
    if (localPriv && localKid === data.kid) {
      priv = localPriv
      return patch({ status: 'ready', kid: data.kid, mode })
    }
    if (localPriv) { await idbDel(`priv:${userId}`); await idbDel(`kid:${userId}`) }
    priv = null
    if (mode === 'auto') {
      try {
        await unlockAuto(userId, data)
        return undefined
      } catch { /* fall through to locked */ }
    }
    patch({ status: 'locked', kid: data.kid, mode })
  } catch {
    priv = null
    patch({ status: 'unavailable' })
  }
}

async function wrapKey(passphrase, salt, iters) {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const ecdh = { name: 'ECDH', namedCurve: 'P-256' }

/* Create a fresh key pair (also used to reset). With no passphrase the backup is opened by a random secret
   that is kept in your own row, so it works on every device automatically. Anything encrypted to an older key can no longer be read. */
export async function setupKeys(userId, passphrase, { create = false } = {}) {
  const pair = await crypto.subtle.generateKey(ecdh, true, ['deriveBits'])
  const pub = cleanJwk(await crypto.subtle.exportKey('jwk', pair.publicKey))
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const kid = await kidOf(pub)
  const row = { user_id: userId, public_key: JSON.stringify(pub), kid, created_at: new Date().toISOString() }
  if (create) {
    // Claim the account's key first. If another device got there a moment ago, use theirs instead.
    const c = await supabase.from('user_keys').insert(row)
    if (c.error) {
      if (c.error.code === '23505' || /duplicate/i.test(c.error.message)) { const e = new Error('raced'); e.code = 'raced'; throw e }
      throw new Error(c.error.message)
    }
  }
  const { fields, secret } = await wrapPrivate(userId, pkcs8, passphrase)
  const b = await supabase.from('key_backups').upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() })
  if (b.error) throw new Error(b.error.message)
  if (secret) {
    const sk = await supabase.from('key_secrets').upsert({ user_id: userId, secret })
    if (sk.error) throw new Error(sk.error.message)
  } else await supabase.from('key_secrets').delete().eq('user_id', userId)
  if (!create) {
    const k = await supabase.from('user_keys').upsert(row)
    if (k.error) throw new Error(k.error.message)
  }
  const local = await crypto.subtle.importKey('pkcs8', pkcs8, ecdh, false, ['deriveBits'])
  await idbSet(`priv:${userId}`, local)
  await idbSet(`kid:${userId}`, kid)
  priv = local
  myPub = pub
  sessions.clear()
  patch({ status: 'ready', kid, mode: passphrase ? 'passphrase' : 'auto' })
}

// Wraps the private key with either a passphrase or a fresh random secret. Returns the backup columns (and the secret, if any).
async function wrapPrivate(userId, pkcs8, passphrase) {
  const iv = rand(12)
  const ad = te.encode(`nook-key-v1:${userId}`)
  if (passphrase) {
    const salt = rand(16)
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, await wrapKey(passphrase, salt, ITERS), pkcs8)
    return { fields: { wrapped: b64(wrapped), salt: b64(salt), iv: b64(iv), iters: ITERS } }
  }
  const raw = rand(32)
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, k, pkcs8)
  return { fields: { wrapped: b64(wrapped), salt: b64(rand(16)), iv: b64(iv), iters: ITERS }, secret: b64(raw) }
}

async function openBackup(userId, secretOrPass, isSecret, bk) {
  const ad = te.encode(`nook-key-v1:${userId}`)
  const key = isSecret ? await crypto.subtle.importKey('raw', unb64(secretOrPass), 'AES-GCM', false, ['decrypt']) : await wrapKey(secretOrPass, unb64(bk.salt), bk.iters)
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(bk.iv), additionalData: ad }, key, unb64(bk.wrapped))
}

// Opens this account's backup with its automatic secret. Another device may still be saving it, so try a few times.
async function unlockAuto(userId, row) {
  for (let i = 0; i < 4; i++) {
    const [{ data: bk }, { data: sec }] = await Promise.all([
      supabase.from('key_backups').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('key_secrets').select('secret').eq('user_id', userId).maybeSingle(),
    ])
    if (bk && sec) {
      const pkcs8 = await openBackup(userId, sec.secret, true, bk)
      const local = await crypto.subtle.importKey('pkcs8', pkcs8, ecdh, false, ['deriveBits'])
      await idbSet(`priv:${userId}`, local)
      await idbSet(`kid:${userId}`, row.kid)
      priv = local
      myPub = JSON.parse(row.public_key)
      sessions.clear()
      return patch({ status: 'ready', kid: row.kid, mode: 'auto' })
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error('No backup')
}

/* Switch between automatic and your-own-passphrase protection without changing your key. */
export async function setPassphraseMode(userId, { passphrase, current }) {
  if (current) current = normRecovery(current)
  const [{ data: bk }, { data: sec }] = await Promise.all([
    supabase.from('key_backups').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('key_secrets').select('secret').eq('user_id', userId).maybeSingle(),
  ])
  if (!bk) throw new Error('No encryption backup was found.')
  let pkcs8
  try { pkcs8 = sec ? await openBackup(userId, sec.secret, true, bk) : await openBackup(userId, current, false, bk) } catch { throw new Error('Your current passphrase is not right.') }
  const { fields, secret } = await wrapPrivate(userId, pkcs8, passphrase)
  if (secret) { const r = await supabase.from('key_secrets').upsert({ user_id: userId, secret }); if (r.error) throw new Error(r.error.message) }
  const u = await supabase.from('key_backups').update({ ...fields, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (u.error) throw new Error(u.error.message)
  if (passphrase) await supabase.from('key_secrets').delete().eq('user_id', userId)
  patch({ mode: passphrase ? 'passphrase' : 'auto' })
}

// A recovery key is read back the way it was shown: groups of letters and numbers with dashes. Accept sloppy typing.
export const normRecovery = (s) => { const t = s.toUpperCase().replace(/[^A-Z2-7]/g, ''); return t.length === 24 ? t.match(/.{4}/g).join('-') : s }
export function makeRecoveryKey() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const r = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(r, (x) => A[x % 32]).join('').match(/.{4}/g).join('-')
}

export async function unlockKeys(userId, passphrase) {
  passphrase = normRecovery(passphrase)
  const { data: bk, error } = await supabase.from('key_backups').select('*').eq('user_id', userId).maybeSingle()
  if (error || !bk) throw new Error('No encryption backup was found for this account.')
  const wk = await wrapKey(passphrase, unb64(bk.salt), bk.iters)
  let pkcs8
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(bk.iv), additionalData: te.encode(`nook-key-v1:${userId}`) }, wk, unb64(bk.wrapped))
  } catch {
    throw new Error('That passphrase is not right.')
  }
  const local = await crypto.subtle.importKey('pkcs8', pkcs8, ecdh, false, ['deriveBits'])
  const { data: row } = await supabase.from('user_keys').select('public_key, kid').eq('user_id', userId).maybeSingle()
  if (!row) throw new Error('Your public key is missing. Reset encryption to create a new one.')
  await idbSet(`priv:${userId}`, local)
  await idbSet(`kid:${userId}`, row.kid)
  priv = local
  myPub = JSON.parse(row.public_key)
  sessions.clear()
  patch({ status: 'ready', kid: row.kid, mode: 'passphrase' })
}

export async function changePassphrase(userId, oldPass, newPass) {
  const { data: bk } = await supabase.from('key_backups').select('*').eq('user_id', userId).maybeSingle()
  if (!bk) throw new Error('No encryption backup was found.')
  let pkcs8
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(bk.iv), additionalData: te.encode(`nook-key-v1:${userId}`) }, await wrapKey(oldPass, unb64(bk.salt), bk.iters), unb64(bk.wrapped))
  } catch {
    throw new Error('Your current passphrase is not right.')
  }
  const salt = rand(16)
  const iv = rand(12)
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`nook-key-v1:${userId}`) }, await wrapKey(newPass, salt, ITERS), pkcs8)
  const { error } = await supabase.from('key_backups').update({ wrapped: b64(wrapped), salt: b64(salt), iv: b64(iv), iters: ITERS, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/* Forget the key on this device only. Your backup stays, so you can unlock again with the passphrase. */
export async function lockDevice(userId) {
  await idbDel(`priv:${userId}`).catch(() => {})
  await idbDel(`kid:${userId}`).catch(() => {})
  priv = null
  sessions.clear()
  patch({ status: 'locked' })
}

/* ---------- other people's public keys ---------- */
const peers = new Map() // id -> { at, value }
export async function peerKey(otherId) {
  const hit = peers.get(otherId)
  if (hit && Date.now() - hit.at < 60000) return hit.value
  const { data, error } = await supabase.from('user_keys').select('public_key, kid').eq('user_id', otherId).maybeSingle()
  if (error) return hit?.value || null
  let value = null
  if (data) {
    const jwk = JSON.parse(data.public_key)
    value = { kid: data.kid, jwk, pub: await crypto.subtle.importKey('jwk', jwk, ecdh, false, []) }
  }
  peers.set(otherId, { at: Date.now(), value })
  return value
}

/* ---------- safety numbers and trust on first use ---------- */
async function safetyNumber(a, b) {
  const [x, y] = [canon(a), canon(b)].sort()
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(`${x}|${y}`)))
  const groups = []
  for (let i = 0; i < 8; i++) {
    const v = ((h[i * 4] << 24) | (h[i * 4 + 1] << 16) | (h[i * 4 + 2] << 8) | h[i * 4 + 3]) >>> 0
    groups.push(String(v % 100000).padStart(5, '0'))
  }
  return groups
}
const pinKey = (userId, otherId) => `nook-pin-${userId}-${otherId}`
export function repin(otherId, kid) {
  try { localStorage.setItem(pinKey(state.userId, otherId), kid) } catch { /* private mode */ }
}

/* ---------- a conversation's shared key ---------- */
const sessions = new Map()
export async function dmSession(dmId, otherId) {
  if (state.status !== 'ready' || !priv) return { status: state.status }
  const peer = await peerKey(otherId)
  if (!peer) return { status: 'no-peer' }
  const ck = `${dmId}|${state.kid}|${peer.kid}`
  let s = sessions.get(ck)
  if (!s) {
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.pub }, priv, 256)
    const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('nook-dm-v1'), info: te.encode(dmId) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    s = { key, safety: await safetyNumber(myPub, peer.jwk) }
    sessions.set(ck, s)
  }
  let pinned = null
  try { pinned = localStorage.getItem(pinKey(state.userId, otherId)) } catch { /* private mode */ }
  if (!pinned) repin(otherId, peer.kid)
  return { status: 'ready', key: s.key, safety: s.safety, peerKid: peer.kid, changed: Boolean(pinned && pinned !== peer.kid) }
}

/* React hook: the encryption state of one conversation. */
export function useDmSession(dmId, otherId) {
  const st = useE2ee()
  const [sess, setSess] = useState({ status: 'checking' })
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (!dmId || !otherId) { setSess({ status: 'off' }); return undefined }
    let live = true
    if (st.status === 'loading') { setSess({ status: 'checking' }); return undefined }
    dmSession(dmId, otherId).then((s) => live && setSess(s)).catch(() => live && setSess({ status: 'unavailable' }))
    return () => { live = false }
  }, [dmId, otherId, st.status, st.kid, bump])
  return { ...sess, refresh: () => { peers.delete(otherId); setBump((n) => n + 1) } }
}

/* ---------- sealing and opening ---------- */
const aad = (dmId, authorId) => te.encode(`${dmId}|${authorId}`)
export async function seal(key, dmId, authorId, obj) {
  const iv = rand(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(dmId, authorId) }, key, te.encode(JSON.stringify(obj)))
  return `${SEALED}${b64(iv)}.${b64(ct)}`
}
export async function open(key, dmId, authorId, str) {
  const [, iv, ct] = str.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: aad(dmId, authorId) }, key, unb64(ct))
  return JSON.parse(td.decode(pt))
}

/* Files get their own random key, which travels inside the sealed message. */
export async function sealFile(file) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = rand(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer())
  return { blob: new Blob([ct], { type: 'application/octet-stream' }), k: b64(await crypto.subtle.exportKey('raw', key)), i: b64(iv) }
}
const fileCache = new Map()
export function openFile({ u, k, i, m }) {
  const id = `${u}|${k}`
  if (!fileCache.has(id)) {
    fileCache.set(id, (async () => {
      const res = await fetch(u)
      if (!res.ok) throw new Error('Could not download the file.')
      const key = await crypto.subtle.importKey('raw', unb64(k), 'AES-GCM', false, ['decrypt'])
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(i) }, key, await res.arrayBuffer())
      return URL.createObjectURL(new Blob([pt], { type: m || 'application/octet-stream' }))
    })().catch((e) => { fileCache.delete(id); throw e }))
  }
  return fileCache.get(id)
}

/* Uploads an already-encrypted blob. */
export async function uploadSealed(userId, blob) {
  const path = `${userId}/enc-${Date.now()}-${b64(rand(6))}.bin`
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'application/octet-stream', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

/* Everything you wrote, with direct messages decrypted, for the "Download my data" button. */
export async function exportMyData(userId) {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw new Error(error.message)
  const msgs = data.messages || []
  const out = []
  const sessionFor = new Map()
  for (const m of msgs) {
    let row = { ...m }
    if (isSealed(m.content) && m.dm_id) {
      try {
        if (!sessionFor.has(m.dm_id)) {
          const { data: dm } = await supabase.from('dms').select('user_a, user_b').eq('id', m.dm_id).maybeSingle()
          const other = dm ? (dm.user_a === userId ? dm.user_b : dm.user_a) : null
          sessionFor.set(m.dm_id, other ? await dmSession(m.dm_id, other) : { status: 'off' })
        }
        const s = sessionFor.get(m.dm_id)
        if (s.status === 'ready') {
          const p = await open(s.key, m.dm_id, m.author_id, m.content)
          row = { ...row, content: p.t || '', decrypted: true, attachment: p.a ? { name: p.a.n, type: p.a.m } : null }
        }
      } catch { /* leave it sealed */ }
    }
    out.push(row)
  }
  return { ...data, messages: out }
}


/* The key for an end-to-end encrypted call. Both people work out the same 32 bytes from their keys, and nothing is sent anywhere.
   Returns null when either side has no key yet, in which case the call is only encrypted in transit. */
export async function callSecret(dmId, otherId) {
  for (let i = 0; i < 12 && state.status === 'loading'; i++) await new Promise((r) => setTimeout(r, 250))
  if (state.status !== 'ready' || !priv) return null
  const peer = await peerKey(otherId)
  if (!peer) return null
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.pub }, priv, 256)
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('nook-call-v1'), info: te.encode(`call:${dmId}`) }, hk, 256)
}
