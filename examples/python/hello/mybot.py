# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

import random

@bot.on('ready')
def ready(me):
    print('Online as', me['name'])
    bot.set_status('playing', 'with /roll')

@bot.slash('ping', description='Check that I am awake')
def ping(i):
    i.reply('pong!')

@bot.slash('roll', description='Roll a die', options=[{'name': 'sides', 'description': 'How many sides (default 6)', 'type': 'integer'}])
def roll(i):
    sides = min(max(i.options.sides or 6, 2), 1000)
    i.reply('🎲 %s rolled **%d** (d%d)' % (i.username, random.randint(1, sides), sides))

@bot.slash('flip', description='Flip a coin')
def flip(i):
    i.reply('🪙 Heads' if random.random() < 0.5 else '🪙 Tails')

@bot.slash('vote', description='Start a poll', options=[
    {'name': 'question', 'description': 'What to ask', 'required': True},
    {'name': 'answers', 'description': 'Answers separated by commas, for example: Pizza, Tacos', 'required': True},
])
def vote(i):
    answers = [x.strip() for x in i.options.answers.split(',') if x.strip()]
    if len(answers) < 2:
        return i.hidden('Give at least two answers, separated by commas.')
    bot.poll(i.channel_id, i.options.question, answers)
    i.hidden('Poll posted!')

# The old way still works too: type !ping
@bot.command('ping', description='Check that I am awake')
def old_ping(m, args):
    m.reply('pong!')

bot.run()
