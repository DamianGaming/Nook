#!/usr/bin/env python3
"""Builds the two installable libraries that the site hosts, so bots can install them like discord.js / discord.py:
     public/sdk/nook-bot.tgz                          npm install https://YOUR-SITE/sdk/nook-bot.tgz
     public/sdk/nook_bot-<ver>-py3-none-any.whl       pip install https://YOUR-SITE/sdk/nook_bot-<ver>-py3-none-any.whl
   Run it after changing public/sdk/nook-bot.mjs or sdk/python/nook_bot/__init__.py:   python3 scripts/build_sdk.py
   (The built files are committed, so normal deploys do not need Python.)"""
import base64, glob, hashlib, io, json, os, re, tarfile, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'sdk')
NODE_SRC = os.path.join(OUT, 'nook-bot.mjs')
PY_SRC = os.path.join(ROOT, 'sdk', 'python', 'nook_bot', '__init__.py')
VERSION = re.search(r"__version__ = '([^']+)'", open(PY_SRC, encoding='utf-8').read()).group(1)
EPOCH = 1_700_000_000  # fixed time so the same source always makes the same file

NODE_README = """# nook-bot

The Node.js library for Nook bots.

    npm install https://YOUR-SITE/sdk/nook-bot.tgz

    import { NookBot } from 'nook-bot'
    const bot = new NookBot()   // NOOK_KEY from the environment or a .env file
    bot.command('ping', (m) => m.reply('pong!'))
    bot.start()

Guide: https://YOUR-SITE/developers
"""
PY_README = NODE_README.replace('npm install https://YOUR-SITE/sdk/nook-bot.tgz', 'pip install https://YOUR-SITE/sdk/nook_bot-%s-py3-none-any.whl' % VERSION).split('    import')[0] + """
    from nook_bot import NookBot
    bot = NookBot()   # NOOK_KEY from the environment or a .env file

    @bot.command('ping')
    def ping(m, args):
        m.reply('pong!')

    bot.run()

Guide: https://YOUR-SITE/developers
"""


def tgz():
    pkg = {'name': 'nook-bot', 'version': VERSION, 'description': 'Make bots for Nook', 'type': 'module', 'main': 'index.mjs',
           'exports': {'.': './index.mjs'}, 'engines': {'node': '>=18'}, 'license': 'MIT'}
    files = {'package/package.json': json.dumps(pkg, indent=2) + '\n', 'package/index.mjs': open(NODE_SRC, encoding='utf-8').read(), 'package/README.md': NODE_README}
    path = os.path.join(OUT, 'nook-bot.tgz')
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as t:
        for name, text in files.items():
            data = text.encode('utf-8')
            ti = tarfile.TarInfo(name); ti.size = len(data); ti.mtime = EPOCH; ti.mode = 0o644
            t.addfile(ti, io.BytesIO(data))
    import gzip
    with open(path, 'wb') as f, gzip.GzipFile(fileobj=f, mode='wb', mtime=EPOCH) as g:
        g.write(raw.getvalue())
    return path


def wheel():
    for old in glob.glob(os.path.join(OUT, 'nook_bot-*.whl')):
        os.remove(old)
    dist = 'nook_bot-%s.dist-info' % VERSION
    body = {
        'nook_bot/__init__.py': open(PY_SRC, encoding='utf-8').read(),
        dist + '/METADATA': 'Metadata-Version: 2.1\nName: nook-bot\nVersion: %s\nSummary: Make bots for Nook\nRequires-Python: >=3.8\nDescription-Content-Type: text/markdown\n\n%s' % (VERSION, PY_README),
        dist + '/WHEEL': 'Wheel-Version: 1.0\nGenerator: nook-build-sdk\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
        dist + '/top_level.txt': 'nook_bot\n',
    }
    rec = []
    for name, text in body.items():
        d = base64.urlsafe_b64encode(hashlib.sha256(text.encode('utf-8')).digest()).rstrip(b'=').decode()
        rec.append('%s,sha256=%s,%d' % (name, d, len(text.encode('utf-8'))))
    rec.append(dist + '/RECORD,,')
    body[dist + '/RECORD'] = '\n'.join(rec) + '\n'
    path = os.path.join(OUT, 'nook_bot-%s-py3-none-any.whl' % VERSION)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in body.items():
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16
            z.writestr(zi, text)
    return path


if __name__ == '__main__':
    print('built', tgz()); print('built', wheel())
    # a plain copy for people who prefer one file:  curl -O https://YOUR-SITE/sdk/nook_bot.py
    open(os.path.join(OUT, 'nook_bot.py'), 'w', encoding='utf-8').write(open(PY_SRC, encoding='utf-8').read())
