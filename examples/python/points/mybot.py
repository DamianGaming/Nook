# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

# Remembers points in a SQLite file (points.db) next to the bot, so nothing is lost when it restarts.
import sqlite3
import threading

db = sqlite3.connect('points.db', check_same_thread=False)
lock = threading.Lock()   # commands run on several threads, so take turns with the database
db.execute('CREATE TABLE IF NOT EXISTS points (user TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)')
db.commit()

@bot.on('message')
def count(m):   # 1 point per message
    if m.is_bot or m.content.startswith('/'):
        return
    with lock:
        db.execute('INSERT INTO points (user, total) VALUES (?, 1) ON CONFLICT(user) DO UPDATE SET total = total + 1', (m.username,))
        db.commit()

@bot.slash('points', description='See how many points someone has', options=[{'name': 'user', 'description': 'Who (default: you)', 'type': 'user'}])
def points(i):
    who = i.options.user or i.username
    with lock:
        row = db.execute('SELECT total FROM points WHERE user = ?', (who,)).fetchone()
    i.reply('%s has **%d** points' % (who, row[0] if row else 0))

@bot.slash('top', description='The top 10')
def top(i):
    with lock:
        rows = db.execute('SELECT user, total FROM points ORDER BY total DESC LIMIT 10').fetchall()
    i.reply({'embed': {'title': '🏆 Leaderboard', 'color': '#f0b232',
                       'description': '\n'.join('%d. **%s**: %d' % (n + 1, u, t) for n, (u, t) in enumerate(rows)) or 'Nobody has any points yet.'}})

bot.run()
