import { supabase } from './supabase.js'

/* Several accounts on one device. Each saved account keeps its own sign-in (the same kind of token the browser already
   stores for you) so you can switch without typing a password. Removing an account here forgets it on this device. */
const KEY = 'nook.accounts'
const MAX = 5

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch { /* private window: switching just will not be remembered */ }
}

export function savedAccounts() { return read() }

// Keep the signed-in account's tokens fresh (call on every session change).
export function rememberSession(session) {
  if (!session?.user || !session.refresh_token) return
  const list = read()
  const i = list.findIndex((a) => a.id === session.user.id)
  const prev = i >= 0 ? list[i] : {}
  const next = { ...prev, id: session.user.id, email: session.user.email || prev.email || '', access_token: session.access_token, refresh_token: session.refresh_token }
  if (i >= 0) list[i] = next; else list.push(next)
  write(list)
}

// Keep the name and picture shown in the switcher current.
export function rememberProfile(profile) {
  if (!profile) return
  const list = read()
  const i = list.findIndex((a) => a.id === profile.id)
  if (i < 0) return
  list[i] = { ...list[i], username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url || null, accent_color: profile.accent_color || null }
  write(list)
}

export function forgetAccount(id) { write(read().filter((a) => a.id !== id)) }

// Move to another saved account. The page reloads so nothing from the old account lingers.
export async function switchAccount(id) {
  const a = read().find((x) => x.id === id)
  if (!a) throw new Error('That account is not saved here any more.')
  const { error } = await supabase.auth.setSession({ access_token: a.access_token, refresh_token: a.refresh_token })
  if (error) { forgetAccount(id); throw new Error('That sign-in has expired. Add the account again.') }
  window.location.reload()
}

// Leave this account on this device but keep the others. Opens the sign-in page.
export async function addAnotherAccount() {
  await supabase.auth.signOut({ scope: 'local' })
}

// Fully sign out the current account, then move on to another saved one if there is one.
export async function signOutCurrent(currentId) {
  forgetAccount(currentId)
  await supabase.auth.signOut()
  const next = read()[0]
  if (next) { try { await switchAccount(next.id) } catch { /* fall through to the sign-in page */ } }
}
