# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

BAD_WORDS = ['badword1', 'badword2']   # edit me

def find(group_id, username):
    return next((x for x in bot.members(group_id) if x.username == username), None)

@bot.on('message')
def word_filter(m):
    if m.is_bot:
        return
    if any(w in m.content.lower() for w in BAD_WORDS):
        try:
            m.delete()
        except Exception:
            pass
        bot.send(m.channel_id, '@%s please keep it friendly.' % m.username)

@bot.slash('kick', description='Remove someone from the group', options=[{'name': 'user', 'description': 'Who', 'type': 'user', 'required': True}])
def kick(i):
    who = find(i.group_id, i.options.user)
    if not who:
        return i.hidden('I cannot find them.')
    bot.kick(i.group_id, who.user_id)
    i.reply('Removed ' + who.username)

@bot.slash('timeout', description='Stop someone chatting for a while', options=[
    {'name': 'user', 'description': 'Who', 'type': 'user', 'required': True},
    {'name': 'minutes', 'description': 'How long (default 10)', 'type': 'integer'},
])
def timeout(i):
    who = find(i.group_id, i.options.user)
    if not who:
        return i.hidden('I cannot find them.')
    bot.timeout(i.group_id, who.user_id, i.options.minutes or 10)
    i.reply(who.username + ' is quiet for a while.')

@bot.slash('purge', description='Delete the latest messages here', options=[{'name': 'count', 'description': 'How many (max 100)', 'type': 'integer', 'required': True}])
def purge(i):
    n = bot.purge(i.channel_id, i.options.count)
    i.hidden('Removed %d messages.' % n)

bot.run()
