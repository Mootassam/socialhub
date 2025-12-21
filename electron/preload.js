// In your preload.js file
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  configurePartition: (partition, options = {}) => {
    try {
      const { userAgent } = options || {};
      return ipcRenderer.invoke('configure-partition', { partition, userAgent });
    } catch (e) {
      return false;
    }
  },
  sendNotification: (providerId, accountId) => {
    ipcRenderer.send('new-notification', { providerId, accountId });
  },
  // Auto Updater API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (_event, value) => callback(value)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, value) => callback(value)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, value) => callback(value)),
});

// Listen for messages from webview content
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NEW_MESSAGE_DETECTED') {
    ipcRenderer.send('new-message-detected', event.data);
  }
});