// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

const WELCOME_CHANNEL = 'general'   // the channel to greet people in
const RULES = ['Be kind.', 'No spam.', 'Keep it on topic.']   // edit me
const rulesText = () => '**Rules**\n' + RULES.map((r, i) => (i + 1) + '. ' + r).join('\n')

bot.on('memberJoin', async (e) => {
  const ch = await bot.channel(WELCOME_CHANNEL)
  if (!ch) return
  await bot.send(ch.id, {
    content: 'Welcome, @' + e.username + '!',
    embed: { title: 'Glad you are here', description: 'Say hi, and have a look at the rules.', color: '#3ba55d' },
    buttons: [{ id: 'rules', label: 'Show the rules', style: 'primary' }],
  })
})
bot.button('rules', (i) => i.hidden(rulesText()))
bot.slash('rules', { description: 'Show the rules' }, (i) => i.reply(rulesText()))

bot.start()
