const { contextBridge, ipcRenderer } = require("electron");

// ============================================================
// VisionBharat — Secure Preload Bridge
// ============================================================

contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getAppInfo: () => ipcRenderer.invoke("app:info"),

  // Open folders
  openFolder: (folder) => ipcRenderer.invoke("app:open-folder", folder),

  // Database backup/restore
  backupDatabase: () => ipcRenderer.invoke("app:backup"),
  restoreDatabase: () => ipcRenderer.invoke("app:restore"),

  // Platform info
  platform: process.platform,
  isElectron: true,
});
