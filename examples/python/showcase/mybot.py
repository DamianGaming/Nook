# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

@bot.slash('card', description='Show a nice embed card')
def card(i):
    i.reply({
        'embed': {
            'author': {'name': 'Nook bot demo'},
            'title': 'Hello, %s!' % i.username,
            'description': 'This is an **embed**. It can hold *formatting*, fields, pictures and more.',
            'color': '#6475f5',
            'fields': [['Server', i.group_name, True], ['Channel', '#' + i.channel_name, True], ['Tip', 'Try the buttons below']],
            'footer': 'Made with Nook',
            'timestamp': True,
        },
        'buttons': [
            {'id': 'demo:like', 'label': 'Like', 'style': 'success'},
            {'id': 'demo:secret', 'label': 'Tell me a secret', 'style': 'primary'},
            {'label': 'Documentation', 'url': 'https://example.com'},
        ],
        'select': {'id': 'demo:color', 'placeholder': 'Pick a favourite colour', 'options': [
            {'label': 'Red', 'value': 'red', 'description': 'Warm'},
            {'label': 'Blue', 'value': 'blue', 'description': 'Cool'},
            {'label': 'Green', 'value': 'green'},
        ]},
    })

likes = {'n': 0}

@bot.button('demo:like')
def like(i):
    likes['n'] += 1
    i.reply('❤️ %s liked it (%d total)' % (i.username, likes['n']))

@bot.button('demo:secret')
def secret(i):
    i.hidden('🤫 Only you can see this message: the bot loves you.')

@bot.select('demo:color')
def colour(i):
    i.hidden('You picked **%s**.' % i.value)

bot.run()
