// Works out what you are doing from the names of the programs that are running.
// Everything happens on this computer. Only the result ("Playing Minecraft") is shared, and only when
// "Show what I'm doing" is switched on. No window contents, no list of programs, nothing else leaves the device.
const { execFile } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const BASE = require('./games.json')
const STREAMERS = { obs64: 'OBS Studio', obs: 'OBS Studio', 'streamlabs desktop': 'Streamlabs', streamlabs: 'Streamlabs', twitchstudio: 'Twitch Studio' }

const key = (n) => String(n || '').toLowerCase().replace(/\.exe$/, '').trim()

/* Apps that are never shared as "Using ...": the desktop itself, system parts, password managers and Nook. */
const NEVER = new Set([
  'explorer', 'applicationframehost', 'searchhost', 'searchapp', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost',
  'lockapp', 'dwm', 'systemsettings', 'taskmgr', 'rundll32', 'conhost', 'widgets', 'nook', 'electron', 'idle',
  '1password', 'bitwarden', 'keepass', 'keepassxc', 'lastpass', 'dashlane', 'nordpass', 'enpass',
])

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim()
function friendly(proc, desc) {
  const d = tidy(desc)
  if (d && d.length <= 60 && !/^(electron|node\.js.*|.*\bhost\b.*|.*\bservice\b.*)$/i.test(d)) return d
  const p = tidy(proc).replace(/[-_.]+/g, ' ')
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : ''
}

/* procs: [{ name, title }]. opts.foreground: { name, desc, path } for the app you have been using (or null).
   Returns a list, because several things can be true at once: { type, name, proc, path? }.
   Order: playing, streaming, listening, using. */
function detect(procs, games, opts = {}) {
  const hidden = opts.hidden || new Set()
  let game = null
  let stream = null
  let spotify = null
  const used = new Set()
  for (const p of procs) {
    const k = key(p.name)
    if (!k) continue
    if (!game && k === 'javaw' && /^minecraft/i.test(p.title || '')) { game = { name: 'Minecraft', proc: k }; used.add(k) }
    if (!game && games[k]) { game = { name: games[k], proc: k }; used.add(k) }
    if (!stream && STREAMERS[k]) { stream = { name: STREAMERS[k], proc: k }; used.add(k) }
    if (!spotify && k === 'spotify' && p.title && !/^spotify(\s|$)/i.test(p.title) && p.title.includes(' - ')) { spotify = { name: p.title, proc: k }; used.add(k) }
  }
  const out = []
  if (game) out.push({ type: 'playing', name: game.name.slice(0, 60), proc: game.proc })
  if (stream) out.push({ type: 'streaming', name: stream.name.slice(0, 60), proc: stream.proc })
  if (spotify) out.push({ type: 'listening', name: spotify.name.slice(0, 60), proc: spotify.proc })
  const fg = opts.foreground
  if (fg) {
    const k = key(fg.name)
    const name = friendly(k, fg.desc)
    if (k && name && !NEVER.has(k) && !hidden.has(k) && !hidden.has(name.toLowerCase()) && !used.has(k)) out.push({ type: 'using', name: name.slice(0, 60), proc: k, path: fg.path || null })
  }
  return out
}

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, out) => resolve(err ? null : out))
  })
}

const SAFE = /^[\w .\-!()+]{1,80}$/
// The script is sent encoded, so no quoting can go wrong.
const psOut = (script, timeout = 10000) => {
  const encoded = Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`, 'utf16le').toString('base64')
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], timeout)
}

const SNAPSHOT_PS = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class NookWin{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'
$fgPid=[uint32]0
[void][NookWin]::GetWindowThreadProcessId([NookWin]::GetForegroundWindow(),[ref]$fgPid)
$t=[char]9
Get-Process | ForEach-Object {
  'N'+$t+$_.ProcessName
  if ($_.ProcessName -eq 'Spotify' -and $_.MainWindowTitle) { 'S'+$t+$_.MainWindowTitle }
  if ($_.Id -eq $fgPid) { $d=''; $f=''; try { $d=$_.MainModule.FileVersionInfo.FileDescription; $f=$_.MainModule.FileName } catch {}; 'F'+$t+$_.ProcessName+$t+$d+$t+$f }
}`

/* One quick look at the computer: program names, the song Spotify is playing (it is in Spotify's window title),
   and which program is in front. Returns { names, spotify, fg }. */
async function snapshot() {
  if (process.platform === 'win32') {
    const out = await psOut(SNAPSHOT_PS)
    if (out) {
      const names = []
      let spotify = null
      let fg = null
      for (const line of out.split(/\r?\n/)) {
        const [kind, a1, a2, a3] = line.split('\t')
        if (kind === 'N' && a1) names.push(a1)
        else if (kind === 'S' && a1 && !spotify) spotify = a1.trim()
        else if (kind === 'F' && a1 && !fg) fg = { name: a1, desc: a2 || '', path: (a3 || '').trim() || null }
      }
      return { names, spotify, fg }
    }
    // PowerShell unavailable: the plain task list (can cut very long names, but covers most games).
    const tl = await run('tasklist', ['/fo', 'csv', '/nh'])
    return { names: tl ? tl.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean) : [], spotify: null, fg: null }
  }
  const ps = await run('ps', ['-A', '-o', 'comm='])
  return { names: ps ? ps.split('\n').map((l) => path.basename(l.trim())).filter(Boolean) : [], spotify: null, fg: null }
}

/* Where a running program lives on disk, so its own icon can be read. Only asked when the activity changes. */
async function exePath(name) {
  if (process.platform !== 'win32' || !SAFE.test(name)) return null
  return psOut(`(Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1).Path`, 8000).then((o) => (o || '').trim() || null)
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

/* Apps you never want shared: a file called hidden-apps.json in the app's data folder, like ["notepad", "My Banking App"]. */
function loadHidden(dir) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(dir, 'hidden-apps.json'), 'utf8'))
    return new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string').map((x) => key(x)))
  } catch { return new Set() }
}

module.exports = { detect, snapshot, exePath, loadGames, loadHidden, key }
