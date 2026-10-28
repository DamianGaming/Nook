const { app, BrowserWindow, protocol, net, shell, session, desktopCapturer, ipcMain, Menu, Tray, nativeImage, powerMonitor } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { detect, snapshot, exePath, loadGames, loadHidden, key } = require('./detect.js')

const APP_DIR = path.join(__dirname, 'app')
const HOST = 'nook.app'
const ORIGIN = `app://${HOST}`

// The website is served from a private "app://" address, so it behaves exactly as it does online
// (same absolute paths, its own storage, workers, microphone and camera).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()
app.setAppUserModelId('gg.megastudios.nook') // lets Windows show proper Nook notifications

let win = null
let tray = null
let quitting = false
let updateReady = null
let activity = []
const statePath = () => path.join(app.getPath('userData'), 'window.json')
function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')) } catch { return {} }
}
function saveState() {
  if (!win || win.isDestroyed()) return
  const b = win.getNormalBounds()
  try { fs.writeFileSync(statePath(), JSON.stringify({ ...b, max: win.isMaximized() })) } catch { /* ignore */ }
}

function serveApp() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url)
    if (url.host !== HOST) return new Response('Not found', { status: 404 })
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.normalize(path.join(APP_DIR, rel))
    if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 })
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(APP_DIR, 'index.html')
    return net.fetch(pathToFileURL(target).toString())
  })
}

function pickSource(sources) {
  // A small window to choose which screen or window to share (Windows has no built-in picker here).
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent: win, modal: true, width: 640, height: 480, minimizable: false, maximizable: false, resizable: false,
      autoHideMenuBar: true, title: 'Choose what to share', backgroundColor: '#12151e',
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: true },
    })
    let done = false
    const finish = (id) => {
      if (done) return
      done = true
      ipcMain.removeHandler('picker:list')
      ipcMain.removeAllListeners('picker:choose')
      if (!picker.isDestroyed()) picker.close()
      resolve(sources.find((s) => s.id === id) || null)
    }
    ipcMain.handle('picker:list', () => sources.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL(), icon: s.appIcon ? s.appIcon.toDataURL() : null })))
    ipcMain.once('picker:choose', (_e, id) => finish(id))
    picker.on('closed', () => finish(null))
    picker.loadFile(path.join(__dirname, 'picker.html'))
  })
}

function setupPermissions() {
  const ses = session.defaultSession
  const allowed = new Set(['media', 'mediaKeySystem', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'display-capture', 'speaker-selection', 'audio-capture', 'video-capture'])
  const mine = (wc) => wc && wc.getURL().startsWith(ORIGIN)
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(mine(wc) && allowed.has(perm)))
  ses.setPermissionCheckHandler((wc, perm) => Boolean(wc ? mine(wc) && allowed.has(perm) : allowed.has(perm)))
  ses.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true })
      const chosen = sources.length ? await pickSource(sources) : null
      if (!chosen) return callback({})
      callback({ video: chosen, audio: chosen.id.startsWith('screen:') ? 'loopback' : undefined })
    } catch {
      callback({})
    }
  })
}

function createWindow() {
  const st = loadState()
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 820, x: st.x, y: st.y, minWidth: 380, minHeight: 560,
    backgroundColor: '#12151e', title: 'Nook', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true, backgroundThrottling: false },
  })
  if (st.max) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('focus', () => win.flashFrame(false))
  win.on('close', (e) => {
    saveState()
    // Closing the window keeps Nook running in the tray so calls and messages carry on. Quit from the tray menu.
    if (!quitting && tray) { e.preventDefault(); win.hide() }
  })
  win.on('closed', () => { win = null })

  // Links to other websites open in the normal browser, never inside Nook.
  const external = (url) => {
    if (url.startsWith(ORIGIN)) return false
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    return true
  }
  win.webContents.setWindowOpenHandler(({ url }) => (external(url) ? { action: 'deny' } : { action: 'allow' }))
  win.webContents.on('will-navigate', (e, url) => { if (external(url)) e.preventDefault() })
  win.loadURL(`${ORIGIN}/`)
}

const show = () => {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
app.on('second-instance', show)

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Nook')
  const build = () => Menu.buildFromTemplate([
    { label: 'Open Nook', click: show },
    { type: 'separator' },
    { label: 'Show the app I am using (not just games)', type: 'checkbox', checked: settings.shareApps, click: (i) => saveSettings({ shareApps: i.checked }) },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: updateReady ? `Restart to update (${updateReady})` : 'Check for updates', click: () => (updateReady ? installUpdate() : checkUpdates(true)) },
    { type: 'separator' },
    { label: 'Quit Nook', click: () => { quitting = true; app.quit() } },
  ])
  tray.setContextMenu(build())
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : show()))
  tray.on('right-click', () => tray.setContextMenu(build()))
}

/* Automatic updates from GitHub Releases (only in the installed app). */
let updater = null
function installUpdate() {
  quitting = true
  if (updater) updater.quitAndInstall()
}
function checkUpdates() {
  if (updater) updater.checkForUpdates().catch(() => {})
}
function setupUpdates() {
  if (!app.isPackaged) return
  try { updater = require('electron-updater').autoUpdater } catch { return }
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.on('update-downloaded', (info) => { updateReady = info.version; send('update:ready', { version: info.version }); if (tray) tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Nook', click: show }, { label: `Restart to update (${info.version})`, click: installUpdate }, { type: 'separator' }, { label: 'Quit Nook', click: () => { quitting = true; app.quit() } }])) })
  updater.on('error', () => {})
  checkUpdates()
  setInterval(checkUpdates, 4 * 3600 * 1000)
}

/* Small settings kept next to the window position. */
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
function loadSettings() {
  try { return { shareApps: true, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) } } catch { return { shareApps: true } }
}
let settings = null
function saveSettings(patch) {
  settings = { ...settings, ...patch }
  try { fs.writeFileSync(settingsPath(), JSON.stringify(settings)) } catch { /* ignore */ }
}

/* Automatic activity: what you are playing, streaming or listening to, and the app you are using.
   Several can be true at once. Checked every 30 seconds. The check is cheap (one quick look at what is running).
   A program's own icon is read once, when it first shows up. */
const iconCache = new Map()
async function iconFor(item) {
  if (!item?.proc) return null
  if (iconCache.has(item.proc)) return iconCache.get(item.proc)
  let data = null
  try {
    const file = item.path || (await exePath(item.proc))
    if (file) {
      const img = await app.getFileIcon(file, { size: 'large' })
      const png = img.isEmpty() ? null : img.resize({ width: 64, height: 64 }).toPNG()
      if (png && png.length < 14000) data = `data:image/png;base64,${png.toString('base64')}`
    }
  } catch { /* no icon is fine */ }
  iconCache.set(item.proc, data)
  return data
}

function startActivity() {
  const games = loadGames(app.getPath('userData'))
  const hidden = loadHidden(app.getPath('userData'))
  let busy = false
  let lastFg = ''      // the program that was in front last time
  let using = null     // the app you are using: only counts once it has stayed in front for a full check
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const { names, spotify, fg } = await snapshot()
      const procs = names.map((n) => ({ name: n, title: '' }))
      if (spotify) procs.push({ name: 'spotify', title: spotify })

      // The app in front: counted when it stays in front for two checks in a row, so quick alt-tabbing is ignored.
      // Nook itself and the desktop do not replace it. Away from the keyboard for 5 minutes clears it.
      const k = fg ? key(fg.name) : ''
      if (k && k === lastFg) using = fg
      if (k && k !== 'nook' && k !== 'electron') lastFg = k
      let idle = 0
      try { idle = powerMonitor.getSystemIdleTime() } catch { /* unknown */ }
      if (idle > 300) using = null
      const foreground = settings.shareApps ? using : null

      const found = detect(procs, games, { foreground, hidden })
      const sig = (l) => l.map((x) => `${x.type}:${x.name}`).join('|')
      if (sig(found) !== sig(activity)) {
        const next = []
        for (const f of found) next.push({ type: f.type, name: f.name, icon: await iconFor(f) })
        activity = next
        send('activity:update', activity)
      }
    } finally { busy = false }
  }
  tick()
  setInterval(tick, 30000)
}

ipcMain.handle('activity:get', () => activity)
ipcMain.on('update:install', installUpdate)
let lastUnread = 0
ipcMain.on('unread', (_e, n) => {
  const count = Math.max(0, Number(n) || 0)
  // Flash the taskbar button when something new arrives while Nook is in the background.
  if (count > lastUnread && win && !win.isFocused()) win.flashFrame(true)
  lastUnread = count
  if (tray) tray.setToolTip(count ? `Nook (${count} unread)` : 'Nook')
})
app.on('before-quit', () => { quitting = true })

app.whenReady().then(() => {
  settings = loadSettings()
  Menu.setApplicationMenu(null)
  serveApp()
  setupPermissions()
  createWindow()
  setupTray()
  setupUpdates()
  startActivity()
  app.on('activate', show)
})
app.on('window-all-closed', () => { if (quitting && process.platform !== 'darwin') app.quit() })
