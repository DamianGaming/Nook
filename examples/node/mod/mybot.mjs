// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

const BAD_WORDS = ['badword1', 'badword2']   // edit me

const find = async (groupId, username) => (await bot.members(groupId)).find((x) => x.username === username)

bot.on('message', async (m) => {
  if (m.is_bot) return
  if (BAD_WORDS.some((w) => m.content.toLowerCase().includes(w))) {
    await m.delete().catch(() => {})
    await bot.send(m.channel_id, '@' + m.username + ' please keep it friendly.')
  }
})

bot.slash('kick', { description: 'Remove someone from the group', options: [{ name: 'user', description: 'Who', type: 'user', required: true }] }, async (i) => {
  const who = await find(i.group_id, i.options.user)
  if (!who) return i.hidden('I cannot find them.')
  await bot.kick(i.group_id, who.user_id)
  return i.reply('Removed ' + who.username)
})

bot.slash('timeout', {
  description: 'Stop someone chatting for a while',
  options: [{ name: 'user', description: 'Who', type: 'user', required: true }, { name: 'minutes', description: 'How long (default 10)', type: 'integer' }],
}, async (i) => {
  const who = await find(i.group_id, i.options.user)
  if (!who) return i.hidden('I cannot find them.')
  await bot.timeout(i.group_id, who.user_id, i.options.minutes || 10)
  return i.reply(who.username + ' is quiet for a while.')
})

bot.slash('purge', { description: 'Delete the latest messages here', options: [{ name: 'count', description: 'How many (max 100)', type: 'integer', required: true }] }, async (i) => {
  const n = await bot.purge(i.channel_id, i.options.count)
  return i.hidden('Removed ' + n + ' messages.')
})

bot.start()
