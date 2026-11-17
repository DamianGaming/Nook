# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

@bot.on('ready')
def ready(me):
    print('Online as', me['name'])

@bot.slash('ping', description='Check that I am awake')
def ping(i):
    i.reply('pong!')

# Add your own commands here.

bot.run()
