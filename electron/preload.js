// In your preload.js file
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
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
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  // Auto Updater API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (_event, value) => callback(value)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, value) => callback(value)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, value) => callback(value)),
  translateText: (text, sourceLang, targetLang) => ipcRenderer.invoke('translate-text', { text, sourceLang, targetLang }),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
});

// Listen for messages from webview content
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NEW_MESSAGE_DETECTED') {
    ipcRenderer.send('new-message-detected', event.data);
  }
});

// Disable native web notifications inside embedded services (webviews)
try {
  const DisabledNotification = function () {
    return undefined;
  };
  DisabledNotification.requestPermission = function (callback) {
    const p = Promise.resolve('denied');
    if (typeof callback === 'function') {
      p.then(callback);
    }
    return p;
  };
  DisabledNotification.permission = 'denied';

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    enumerable: true,
    get() {
      return DisabledNotification;
    },
    set() {
      // ignore any attempts to overwrite
    }
  });
} catch (e) {
}
