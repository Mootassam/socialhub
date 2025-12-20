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
  }
});

// Listen for messages from webview content
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NEW_MESSAGE_DETECTED') {
    ipcRenderer.send('new-message-detected', event.data);
  }
});