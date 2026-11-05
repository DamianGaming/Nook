// A starter bot. Fill in the three values below (the portal shows them), then run:  node ping-bot.mjs
import { NookBot } from './nook-bot.mjs'

const bot = new NookBot({
  url: 'https://YOUR-PROJECT.supabase.co',
  anonKey: 'YOUR-ANON-KEY',
  token: process.env.NOOK_TOKEN || 'nk_YOUR_BOT_TOKEN',
})

bot.on('ready', async (me) => {
  console.log(`Logged in as ${me.name} (@${me.username}) in ${me.groups.length} group(s)`)
  await bot.setStatus('playing', 'with !help')
})
bot.on('error', (e) => console.error('Problem:', e.message))

bot.command('ping', (m) => m.reply('pong! 🏓'), { description: 'Check that I am awake' })
bot.command('roll', (m, args) => {
  const sides = Math.min(1000, Math.max(2, parseInt(args[0], 10) || 6))
  return m.reply(`🎲 You rolled **${1 + Math.floor(Math.random() * sides)}** (d${sides})`)
}, { description: 'Roll a die, for example !roll 20', cooldown: 3 })
bot.command('about', (m) => bot.embed(m.channel_id, {
  title: 'Hello, I am a Nook bot',
  description: 'I run on my owner\'s own computer. Try `!help`.',
  color: '#6475f5',
  footer: 'Made with nook-bot.mjs',
}), { description: 'About this bot' })
bot.command('vote', (m, args, text) => bot.poll(m.channel_id, text || 'Pizza tonight?', ['Yes', 'No', 'Maybe']), { description: 'Start a poll: !vote Question?' })
bot.on('mention', (m) => m.react('👋'))

bot.start()
