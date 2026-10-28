// Works out what you are doing from the names of the programs that are running.
// Everything happens on this computer. Only the result ("Playing Minecraft") is shared, and only when
// "Show what I'm doing" is switched on. No window contents, no list of programs, nothing else leaves the device.
const { execFile } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const BASE = require('./games.json')
const STREAMERS = { obs64: 'OBS Studio', obs: 'OBS Studio', 'streamlabs desktop': 'Streamlabs', streamlabs: 'Streamlabs', twitchstudio: 'Twitch Studio' }

const key = (n) => String(n || '').toLowerCase().replace(/\.exe$/, '').trim()

/* procs: [{ name, title }]. Returns { type, name } or null. A game beats streaming, which beats music. */
function detect(procs, games) {
  const hit = new Map()
  let spotify = null
  for (const p of procs) {
    const k = key(p.name)
    if (!k) continue
    if (k === 'javaw' && /^minecraft/i.test(p.title || '') && !hit.has('g')) hit.set('g', 'Minecraft')
    if (games[k] && !hit.has('g')) hit.set('g', games[k])
    if (STREAMERS[k] && !hit.has('s')) hit.set('s', STREAMERS[k])
    if (k === 'spotify' && p.title && !/^spotify(\s|$)/i.test(p.title) && p.title.includes(' - ')) spotify = p.title
  }
  if (hit.has('g')) return { type: 'playing', name: hit.get('g').slice(0, 60) }
  if (hit.has('s')) return { type: 'streaming', name: hit.get('s').slice(0, 60) }
  if (spotify) return { type: 'listening', name: spotify.slice(0, 60) }
  return null
}

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, out) => resolve(err ? null : out))
  })
}

async function listProcesses() {
  if (process.platform === 'win32') {
    const ps = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress'])
    if (ps) {
      try {
        const j = JSON.parse(ps)
        return (Array.isArray(j) ? j : [j]).map((p) => ({ name: p.ProcessName, title: p.MainWindowTitle || '' }))
      } catch { /* fall through */ }
    }
    const tl = await run('tasklist', ['/fo', 'csv', '/nh'])
    return tl ? tl.split(/\r?\n/).map((l) => ({ name: (l.match(/^"([^"]+)"/) || [])[1], title: '' })).filter((p) => p.name) : []
  }
  const ps = await run('ps', ['-A', '-o', 'comm='])
  return ps ? ps.split('\n').map((l) => ({ name: path.basename(l.trim()), title: '' })).filter((p) => p.name) : []
}

/* Extra games you can add yourself: a file called custom-games.json in the app's data folder,
   like { "mygame": "My Game" } (program name without .exe, in lower case). */
function loadGames(dir) {
  let extra = {}
  try { extra = JSON.parse(fs.readFileSync(path.join(dir, 'custom-games.json'), 'utf8')) } catch { /* none */ }
  const clean = {}
  for (const [k, v] of Object.entries(extra)) if (typeof v === 'string') clean[key(k)] = v
  return { ...BASE, ...clean }
}

module.exports = { detect, listProcesses, loadGames }
