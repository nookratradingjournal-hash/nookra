const { contextBridge, ipcRenderer } = require('electron')

// Fetch the real device name synchronously during preload (before page loads).
// This blocks briefly but only runs once at startup.
const deviceName = ipcRenderer.sendSync('get-device-name')

contextBridge.exposeInMainWorld('electronAPI', {
  deviceName,
  resizeWindow: (width, height, animate, resizable, maximize) =>
    ipcRenderer.send('resize-window', { width, height, animate, resizable, maximize }),
})

// ── Update pipeline bridge ────────────────────────────────────────────────
// Clean, promise-based surface for the renderer. Every method returns a
// Promise; errors are embedded in the result shape (not thrown) so the
// renderer can render a friendly fallback without try/catch everywhere.
contextBridge.exposeInMainWorld('updateAPI', {
  /** Current app version from package.json (as reported by app.getVersion). */
  getCurrentVersion: () => ipcRenderer.invoke('update:get-current-version'),
  /** 'mac' | 'windows' | 'other' — picked from process.platform in main. */
  getPlatform:       () => ipcRenderer.invoke('update:get-platform'),
  /** Latest update for the host platform, or { status: 'none' }. */
  getLatest:         () => ipcRenderer.invoke('update:get-latest'),
  /** Open a download URL (relative /updates/... paths are resolved). */
  openDownload:      (url) => ipcRenderer.invoke('update:open-download', url),
  // ── Admin-only methods. Main app won't use these, but they are on the
  //    same bridge so a single preload ships to both windows. ──────────
  list:              () => ipcRenderer.invoke('update:list'),
  save:              (entry) => ipcRenderer.invoke('update:save', entry),
  delete:            (id) => ipcRenderer.invoke('update:delete', id),
})
