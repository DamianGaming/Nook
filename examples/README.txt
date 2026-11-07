Complete example bots, one folder each, in Node.js (node/) and Python (python/).

Each folder is what the Developer portal's "Download bot folder" gives you:
  - the bot file (mybot.mjs or mybot.py)
  - start.bat (installs the Nook library and anything else the bot needs, runs it, restarts it if it stops)
  - package.json or requirements.txt
  - .env.example: copy it to .env and paste your connect key from the Developer portal

The Nook library is fetched from your site when you install, like discord.js or discord.py:
  Node:    npm install https://YOUR-SITE/sdk/nook-bot.tgz
  Python:  pip install https://YOUR-SITE/sdk/nook_bot-4.0.0-py3-none-any.whl

Replace YOUR-SITE (it is already filled in when the files come from the portal).
Bots do not store anything between restarts. The "points" example shows how to keep data in your own SQLite file.
