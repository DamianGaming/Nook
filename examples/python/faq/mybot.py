# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

ANSWERS = [   # edit me
    {'topic': 'How do I join?', 'words': ['how do i join', 'invite link'], 'reply': 'Ask a moderator for an invite code.'},
    {'topic': 'Server address', 'words': ['server ip', 'how to connect'], 'reply': 'The address is on the pinned message in #info.'},
]

@bot.slash('help', description='Get help')
def help_menu(i):
    i.hidden({
        'content': 'What do you need help with?',
        'select': {'id': 'faq', 'placeholder': 'Choose a topic', 'options': [{'label': a['topic'], 'value': str(n)} for n, a in enumerate(ANSWERS)]},
    })

@bot.select('faq')
def faq_answer(i):
    n = int(i.value)
    i.hidden(ANSWERS[n]['reply'] if 0 <= n < len(ANSWERS) else 'Sorry, I do not know that one.')

@bot.on('message')
def auto_reply(m):
    if m.is_bot or m.content.startswith(bot.prefix):
        return
    for a in ANSWERS:
        if any(w in m.content.lower() for w in a['words']):
            m.reply(a['reply'])
            break

bot.run()
