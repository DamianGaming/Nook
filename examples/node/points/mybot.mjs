// Your Nook bot. Start it with start.bat (Windows) or:  node mybot.mjs
import { NookBot } from 'nook-bot'

const bot = new NookBot()   // reads NOOK_KEY from the .env file

// Remembers points in a SQLite file (points.db) next to the bot, so nothing is lost when it restarts.
import Database from 'better-sqlite3'

const db = new Database('points.db')
db.exec('CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)')
const addPoint = db.prepare('INSERT INTO points (user, total) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET total = total + 1')
const getPoints = db.prepare('SELECT total FROM points WHERE user = ?')
const topTen = db.prepare('SELECT user, total FROM points ORDER BY total DESC LIMIT 10')

bot.on('message', (m) => { if (!m.is_bot && !m.content.startsWith('/')) addPoint.run(m.username) })   // 1 point per message

bot.slash('points', { description: 'See how many points someone has', options: [{ name: 'user', description: 'Who (default: you)', type: 'user' }] }, (i) => {
  const who = i.options.user || i.username
  return i.reply(who + ' has **' + (getPoints.get(who)?.total ?? 0) + '** points')
})

bot.slash('top', { description: 'The top 10' }, (i) => i.reply({
  embed: {
    title: '🏆 Leaderboard',
    color: '#f0b232',
    description: topTen.all().map((r, n) => (n + 1) + '. **' + r.user + '**: ' + r.total).join('\n') || 'Nobody has any points yet.',
  },
}))

bot.start()
