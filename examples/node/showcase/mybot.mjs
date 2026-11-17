// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

bot.slash('card', { description: 'Show a nice embed card' }, (i) => i.reply({
  embed: {
    author: { name: 'Nook bot demo' },
    title: 'Hello, ' + i.username + '!',
    description: 'This is an **embed**. It can hold *formatting*, fields, pictures and more.',
    color: '#6475f5',
    fields: [['Server', i.group_name, true], ['Channel', '#' + i.channel_name, true], ['Tip', 'Try the buttons below']],
    footer: 'Made with Nook',
    timestamp: true,
  },
  buttons: [
    { id: 'demo:like', label: 'Like', style: 'success' },
    { id: 'demo:secret', label: 'Tell me a secret', style: 'primary' },
    { label: 'Documentation', url: 'https://example.com' },
  ],
  select: { id: 'demo:color', placeholder: 'Pick a favourite colour', options: [
    { label: 'Red', value: 'red', description: 'Warm' },
    { label: 'Blue', value: 'blue', description: 'Cool' },
    { label: 'Green', value: 'green' },
  ] },
}))

let likes = 0
bot.button('demo:like', (i) => { likes += 1; return i.reply('❤️ ' + i.username + ' liked it (' + likes + ' total)') })
bot.button('demo:secret', (i) => i.hidden('🤫 Only you can see this message: the bot loves you.'))
bot.select('demo:color', (i) => i.hidden('You picked **' + i.value + '**.'))

bot.start()
