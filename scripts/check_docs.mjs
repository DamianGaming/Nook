// Fails when the bot libraries have something the documentation (and so the AI brief) does not mention.
// Run by scripts/build_sdk.py, so a library change can never ship with stale docs.
import { readFileSync } from 'node:fs'
const docs = readFileSync(new URL('../src/botDocs.js', import.meta.url), 'utf8')
const js = readFileSync(new URL('../public/sdk/nook-bot.mjs', import.meta.url), 'utf8')
const py = readFileSync(new URL('../sdk/python/nook_bot/__init__.py', import.meta.url), 'utf8')
const snake = (n) => n.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
const SKIP_JS = new Set(['constructor', 'rpc', 'sleep', 'helpText', 'start', 'stop', 'decodeKey', 'encodeMessage', 'encodeEmbed', 'encodePoll', 'toJSON', 'on'])
const SKIP_PY = new Set(['rpc', 'sleep', 'help_text', 'start', 'stop', 'run', 'on', 'command', 'slash', 'button', 'select', 'modal'])
const problems = []
const klass = js.slice(js.indexOf('export class NookBot'))
for (const m of klass.matchAll(/^  (?:async |static )?([a-zA-Z]+)\(/gm)) {
  const n = m[1]
  if (n.startsWith('_') || SKIP_JS.has(n)) continue
  if (!new RegExp(`\\b${n}\\b`).test(docs)) problems.push(`Node: bot.${n}() is not in src/botDocs.js`)
}
for (const m of js.matchAll(/^\s+i\.([a-zA-Z]+) = /gm)) if (!new RegExp(`\\bi\\.${m[1]}\\b`).test(docs)) problems.push(`Node: i.${m[1]} is not in src/botDocs.js`)
const pyCls = py.slice(py.indexOf('class NookBot'))
for (const m of pyCls.matchAll(/^    def ([a-z][a-z0-9_]*)\(/gm)) {
  const n = m[1]
  if (SKIP_PY.has(n)) continue
  const camel = n.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  if (!docs.includes(n) && !new RegExp(`\\b${camel}\\b`).test(docs)) problems.push(`Python: bot.${n}() is not in src/botDocs.js`)
}
for (const m of py.matchAll(/^\s+i\['([a-z_]+)'\] = /gm)) {
  const camel = m[1].replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  if (!docs.includes('i.' + m[1]) && !docs.includes('i.' + camel)) problems.push(`Python: i.${m[1]} is not in src/botDocs.js`)
}
const ver = /__version__ = '([^']+)'/.exec(py)[1]
if (!docs.includes(`PY_VERSION = '${ver}'`)) problems.push(`PY_VERSION in src/botDocs.js is not ${ver}`)
if (!new RegExp(`VERSION = '${ver.replace(/\./g, '\\.')}'`).test(js)) problems.push(`VERSION in public/sdk/nook-bot.mjs is not ${ver}`)
if (problems.length) { console.error('Docs are out of date:\n - ' + problems.join('\n - ')); process.exit(1) }
console.log(`Docs cover every library function (version ${ver}).`)
