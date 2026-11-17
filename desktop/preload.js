// The page is the website, unchanged. This only gives it a few desktop extras, which it uses when present.
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel) => (cb) => {
  const f = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, f)
  return () => ipcRenderer.removeListener(channel, f)
}

contextBridge.exposeInMainWorld('nookDesktop', {
  isDesktop: true,
  platform: process.platform,
  getActivity: () => ipcRenderer.invoke('activity:get'),
  onActivity: listen('activity:update'),
  onUpdate: listen('update:ready'),
  onUpdateStatus: listen('update:status'),
  checkUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onHotkey: listen('hotkey'),
  getHotkeys: () => ipcRenderer.invoke('hotkeys:get'),
  setHotkey: (action, accel) => ipcRenderer.invoke('hotkeys:set', action, accel),
  setUnread: (n) => ipcRenderer.send('unread', n),
})
