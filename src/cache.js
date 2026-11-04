// A small offline copy of the newest messages in each chat, kept in this browser (IndexedDB).
// Encrypted chats are stored exactly as the server holds them (still encrypted). Everything is wiped on sign-out.
const DB = 'nook-cache'
const STORE = 'chats'
let dbp = null

function db() {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbp.catch(() => { dbp = null })
  return dbp
}

const run = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
  const tx = d.transaction(STORE, mode)
  const r = fn(tx.objectStore(STORE))
  tx.oncomplete = () => resolve(r?.result)
  tx.onerror = () => reject(tx.error)
}))

export const readCache = (key) => run('readonly', (s) => s.get(key)).catch(() => null)
export const writeCache = (key, value) => run('readwrite', (s) => s.put({ ...value, at: Date.now() }, key)).catch(() => {})
export const clearCache = () => run('readwrite', (s) => s.clear()).catch(() => {})
