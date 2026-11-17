// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

bot.on('ready', (me) => console.log('Online as', me.name))
bot.slash('ping', { description: 'Check that I am awake' }, (i) => i.reply('pong!'))
// Add your own commands here.

bot.start()
