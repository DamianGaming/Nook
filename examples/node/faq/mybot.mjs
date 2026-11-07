// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

const ANSWERS = [   // edit me
  { topic: 'How do I join?', words: ['how do i join', 'invite link'], reply: 'Ask a moderator for an invite code.' },
  { topic: 'Server address', words: ['server ip', 'how to connect'], reply: 'The address is on the pinned message in #info.' },
]

bot.slash('help', { description: 'Get help' }, (i) => i.hidden({
  content: 'What do you need help with?',
  select: { id: 'faq', placeholder: 'Choose a topic', options: ANSWERS.map((a, n) => ({ label: a.topic, value: String(n) })) },
}))
bot.select('faq', (i) => i.hidden(ANSWERS[Number(i.value)]?.reply || 'Sorry, I do not know that one.'))

bot.on('message', async (m) => {
  if (m.is_bot || m.content.startsWith(bot.prefix)) return
  const hit = ANSWERS.find((a) => a.words.some((w) => m.content.toLowerCase().includes(w)))
  if (hit) await m.reply(hit.reply)
})

bot.start()
