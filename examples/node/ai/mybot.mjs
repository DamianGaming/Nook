// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

// Needs an OpenAI API key from platform.openai.com, set as OPENAI_API_KEY (see the guide).
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const memory = new Map()   // short memory per channel

async function ask(channelId, who, text) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return 'The owner has not set OPENAI_API_KEY yet.'
  const history = memory.get(channelId) || []
  history.push({ role: 'user', content: who + ': ' + text })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: 'You are a friendly assistant in a chat group. Keep answers short.' }, ...history.slice(-10)] }),
  })
  const data = await res.json()
  if (!res.ok) return 'The AI service said: ' + (data.error?.message || res.status)
  const answer = (data.choices?.[0]?.message?.content || '...').slice(0, 1900)
  history.push({ role: 'assistant', content: answer })
  memory.set(channelId, history.slice(-10))
  return answer
}

bot.slash('ask', {
  description: 'Ask the AI a question',
  options: [{ name: 'question', description: 'What do you want to know?', required: true }, { name: 'private', description: 'Only show the answer to me', type: 'boolean' }],
}, async (i) => i.reply(await ask(i.channel_id, i.username, i.options.question), { hidden: !!i.options.private }))

bot.on('mention', async (m) => { if (!m.content.startsWith(bot.prefix)) await m.reply(await ask(m.channel_id, m.username, m.content)) })

bot.start()
