# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

WELCOME_CHANNEL = 'general'   # the channel to greet people in
RULES = ['Be kind.', 'No spam.', 'Keep it on topic.']   # edit me

def rules_text():
    return '**Rules**\n' + '\n'.join('%d. %s' % (n + 1, r) for n, r in enumerate(RULES))

@bot.on('member_join')
def welcome(e):
    ch = bot.channel(WELCOME_CHANNEL)
    if not ch:
        return
    bot.send(ch.id, {
        'content': 'Welcome, @%s!' % e.username,
        'embed': {'title': 'Glad you are here', 'description': 'Say hi, and have a look at the rules.', 'color': '#3ba55d'},
        'buttons': [{'id': 'rules', 'label': 'Show the rules', 'style': 'primary'}],
    })

@bot.button('rules')
def rules_button(i):
    i.hidden(rules_text())

@bot.slash('rules', description='Show the rules')
def rules(i):
    i.reply(rules_text())

bot.run()
