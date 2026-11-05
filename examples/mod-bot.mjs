// A moderation + community bot. Give it the permissions it needs in Group settings > Members:
//   members  -> !kick, !timeout     messages -> !pin, !purge, deleting rule-breakers' messages     channels -> !newchannel
// Run:  node mod-bot.mjs
import { NookBot } from './nook-bot.mjs'

const bot = new NookBot({ url: 'https://YOUR-PROJECT.supabase.co', anonKey: 'YOUR-ANON-KEY', token: process.env.NOOK_TOKEN || 'nk_YOUR_BOT_TOKEN' })
const BAD_WORDS = ['badword1', 'badword2'] // edit me
const find = async (groupId, name) => (await bot.members(groupId)).find((x) => x.username === name.replace(/^@/, '').toLowerCase())

bot.on('error', (e) => console.error('Problem:', e.message))
bot.on('ready', (me) => console.log('Moderating', me.groups.map((g) => g.name).join(', ')))

// Welcome new people in the group's first channel.
bot.on('memberJoin', async (ev) => {
  const g = (await bot.groups()).find((x) => x.id === ev.group_id)
  if (g?.channels[0]) bot.send(g.channels[0].id, `Welcome to ${g.name}, @${ev.username}! 👋`)
})

// Delete messages with banned words, and warn once.
const check = async (m) => {
  if (m.is_bot || !BAD_WORDS.some((w) => m.content?.toLowerCase().includes(w))) return
  try { await m.delete(); await m.say(`@${m.username} please keep it friendly.`) } catch (e) { console.error('Could not delete:', e.message) }
}
bot.on('message', check)
bot.on('edit', check)

bot.command('timeout', async (m, [who, mins]) => {
  const t = await find(m.group_id, who || '')
  if (!t) return m.reply('Usage: !timeout @name minutes')
  await bot.timeout(m.group_id, t.user_id, parseInt(mins, 10) || 10)
  m.reply(`⏳ ${t.display_name} is timed out for ${parseInt(mins, 10) || 10} minutes.`)
}, { description: 'Time someone out' })

bot.command('kick', async (m, [who]) => {
  const t = await find(m.group_id, who || '')
  if (!t) return m.reply('Usage: !kick @name')
  await bot.kick(m.group_id, t.user_id)
  m.reply(`👢 Removed ${t.display_name}.`)
}, { description: 'Remove someone' })

bot.command('pin', async (m) => { if (m.reply_to) { await bot.pin(m.reply_to); m.react('📌') } else m.reply('Reply to a message with !pin') }, { description: 'Pin the message you reply to' })

bot.command('purge', async (m, [n]) => {
  const rows = await bot.history(m.channel_id, { limit: Math.min(50, parseInt(n, 10) || 10) })
  for (const r of rows) await bot.delete(r.id).catch(() => {})
}, { description: 'Delete the last few messages' })

// A tiny points system saved with bot.kv (no database needed).
bot.on('reaction', async (ev) => {
  if (ev.kind !== '⭐') return
  const key = `stars:${ev.channel_id}`
  const owner = (await bot.getMessage(ev.message_id)).author_username
  const cur = (await bot.kv.get(`stars:${owner}`)) || 0
  await bot.kv.set(`stars:${owner}`, cur + 1)
})
bot.command('stars', async (m, [who]) => m.reply(`⭐ ${(await bot.kv.get(`stars:${(who || m.username).replace(/^@/, '')}`)) || 0}`), { description: 'Show how many stars someone has' })

bot.start()
