# Your Nook bot. Start it with start.bat (Windows) or:  python mybot.py
from nook_bot import NookBot

bot = NookBot()   # reads NOOK_KEY from the .env file

import json, os, urllib.request

# Needs an OpenAI API key from platform.openai.com. Put OPENAI_API_KEY=sk-... in the .env file next to this bot.
MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
memory = {}   # short memory per channel (lost when the bot restarts)

def ask(channel_id, who, text):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        return 'The owner has not set OPENAI_API_KEY yet.'
    history = memory.setdefault(channel_id, [])
    history.append({'role': 'user', 'content': '%s: %s' % (who, text)})
    body = json.dumps({'model': MODEL, 'messages': [{'role': 'system', 'content': 'You are a friendly assistant in a chat group. Keep answers short.'}] + history[-10:]}).encode()
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=body, headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
    except Exception as e:
        return 'The AI service did not answer: %s' % e
    answer = (data['choices'][0]['message']['content'] or '...')[:1900]
    history.append({'role': 'assistant', 'content': answer})
    del history[:-10]
    return answer

@bot.slash('ask', description='Ask the AI a question', options=[
    {'name': 'question', 'description': 'What do you want to know?', 'required': True},
    {'name': 'private', 'description': 'Only show the answer to me', 'type': 'boolean'},
])
def ask_command(i):
    i.reply(ask(i.channel_id, i.username, i.options.question), hidden=bool(i.options.private))

@bot.on('mention')
def on_mention(m):
    if not m.content.startswith(bot.prefix):
        m.reply(ask(m.channel_id, m.username, m.content))

bot.run()
