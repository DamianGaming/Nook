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
  installUpdate: () => ipcRenderer.send('update:install'),
  setUnread: (n) => ipcRenderer.send('unread', n),
})
