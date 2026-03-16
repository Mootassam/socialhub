'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// ─── Single-listener registry ──────────────────────────────────────────────────
// Prevents duplicate listeners from accumulating when React components re-mount
const listeners = new Map(); // channel → { cb, wrapper }

function onChannel(channel, callback) {
  // Remove any old listener on this channel first
  offChannel(channel);
  const wrapper = (_event, value) => callback(value);
  listeners.set(channel, { cb: callback, wrapper });
  ipcRenderer.on(channel, wrapper);
}

function offChannel(channel) {
  const entry = listeners.get(channel);
  if (entry) {
    ipcRenderer.removeListener(channel, entry.wrapper);
    listeners.delete(channel);
  }
}

// ─── Exposed API ───────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window controls
  minimizeApp:  () => ipcRenderer.invoke('minimize-app'),
  maximizeApp:  () => ipcRenderer.invoke('maximize-app'),
  closeApp:     () => ipcRenderer.invoke('close-app'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Settings & App State
  loadSettings: ()      => ipcRenderer.invoke('load-settings'),
  saveSettings: (data)  => ipcRenderer.invoke('save-settings', data),
  loadAppState: ()      => ipcRenderer.invoke('load-app-state'),
  saveAppState: (data)  => ipcRenderer.invoke('save-app-state', data),

  // Webview preload path (cached in main)
  getPreloadPath:     () => ipcRenderer.invoke('get-preload-path'),

  // Session partition configuration
  configurePartition: (partition, options = {}) => {
    try {
      const { userAgent } = options || {};
      return ipcRenderer.invoke('configure-partition', { partition, userAgent });
    } catch { return Promise.resolve(false); }
  },

  // Native OS notification
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // Background polling — main process manages hidden BrowserWindows
  startBackground: (providerId, accountId, url, partition, userAgent) =>
    ipcRenderer.invoke('start-background', { providerId, accountId, url, partition, userAgent }),
  stopBackground: (providerId, accountId) =>
    ipcRenderer.invoke('stop-background', { providerId, accountId }),

  // Active context (suppress notifications when user is looking)
  setActiveContext: (providerId, accountId) =>
    ipcRenderer.send('active-context', { providerId, accountId }),

  // Message detected events (from main-process background polling)
  // Safe: replaces previous listener on each call — no accumulation
  onMessageDetected: (callback) => onChannel('message-detected', callback),
  offMessageDetected: () => offChannel('message-detected'),

  // Data management
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),

  // Auto Updater
  checkForUpdates:        () => ipcRenderer.invoke('check-for-updates'),
  startDownloadUpdate:    () => ipcRenderer.invoke('start-download-update'),
  quitAndInstallUpdate:   () => ipcRenderer.invoke('quit-and-install-update'),
  onUpdateAvailable:      (cb) => onChannel('update-available',     cb),
  onUpdateNotAvailable:   (cb) => onChannel('update-not-available', cb),
  onDownloadProgress:     (cb) => onChannel('download-progress',    cb),
  onUpdateDownloaded:     (cb) => onChannel('update-downloaded',    cb),
  onUpdateError:          (cb) => onChannel('update-error',         cb),
  offUpdateListeners: () => {
    offChannel('update-available');
    offChannel('update-not-available');
    offChannel('download-progress');
    offChannel('update-downloaded');
    offChannel('update-error');
  },

  // Window focus/blur state (emitted by main process on window events)
  onWindowFocusChanged: (cb) => onChannel('window-focus-changed', cb),
  offWindowFocusChanged: () => offChannel('window-focus-changed'),
});

// ─── Forward webview → main postMessages ──────────────────────────────────────
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NEW_MESSAGE_DETECTED') {
    ipcRenderer.send('new-message-detected', event.data);
  }
});

// ─── Disable native web Notification API in renderer ──────────────────────────
// Prevents web apps rendered directly in the mainWindow from firing browser toasts
try {
  const NoopNotification = function() { return undefined; };
  NoopNotification.requestPermission = () => Promise.resolve('denied');
  Object.defineProperty(NoopNotification, 'permission', { get: () => 'denied' });

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    enumerable: true,
    get: () => NoopNotification,
    set: () => {}, // ignore overwrites
  });
} catch {}
