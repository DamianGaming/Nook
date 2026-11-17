import { supabase } from './supabase.js'
import { dmSession, seal, requestE2eeDialog } from './e2ee.js'

// Sends a text message into a DM from anywhere in the app, sealing it like the chat box does.
export async function sendDM({ dmId, otherId, meId, text }) {
  const s = await dmSession(dmId, otherId)
  if (s.status === 'locked') { requestE2eeDialog('unlock'); throw new Error('Unlock encryption to send messages in this chat.') }
  if (s.status === 'checking') throw new Error('One moment, checking this chat\'s encryption. Try again.')
  const content = s.status === 'ready' ? await seal(s.key, dmId, meId, { t: text }) : text
  const { error } = await supabase.from('messages').insert({ dm_id: dmId, author_id: meId, content, attachment_url: null })
  if (error) throw error
}
