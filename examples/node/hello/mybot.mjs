// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

bot.on('ready', async (me) => {
  console.log('Online as', me.name)
  await bot.setStatus('playing', 'with /roll')
})

bot.slash('ping', { description: 'Check that I am awake' }, (i) => i.reply('pong!'))

bot.slash('roll', {
  description: 'Roll a die',
  options: [{ name: 'sides', description: 'How many sides (default 6)', type: 'integer' }],
}, (i) => {
  const sides = Math.min(Math.max(i.options.sides || 6, 2), 1000)
  return i.reply('🎲 ' + i.username + ' rolled **' + (1 + Math.floor(Math.random() * sides)) + '** (d' + sides + ')')
})

bot.slash('flip', { description: 'Flip a coin' }, (i) => i.reply(Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails'))

bot.slash('vote', {
  description: 'Start a poll',
  options: [
    { name: 'question', description: 'What to ask', required: true },
    { name: 'answers', description: 'Answers separated by commas, for example: Pizza, Tacos', required: true },
  ],
}, async (i) => {
  const answers = i.options.answers.split(',').map((x) => x.trim()).filter(Boolean)
  if (answers.length < 2) return i.hidden('Give at least two answers, separated by commas.')
  await bot.poll(i.channel_id, i.options.question, answers)
  return i.hidden('Poll posted!')
})

// The old way still works too: type !ping
bot.command('ping', (m) => m.reply('pong!'), { description: 'Check that I am awake' })

bot.start()
