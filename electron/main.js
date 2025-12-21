const { app, BrowserWindow, Menu, Tray, shell, ipcMain,  session, Notification } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Optimization Flags
app.commandLine.appendSwitch('disable-smooth-scrolling'); // Save CPU
app.commandLine.appendSwitch('wm-window-animations-disabled'); // Save GPU
// app.commandLine.appendSwitch('disable-gpu-compositing'); // Too aggressive, might flicker
// app.commandLine.appendSwitch('disable-gpu'); // Too aggressive

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    show: false, // prevent flicker
    icon: path.join(__dirname, '../public/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      partition: 'persist:webviews',
    },
    frame: true,
    titleBarStyle: 'hiddenInset',
  });

  mainWindow.maximize();
  mainWindow.show();

  // Load the React app
  // In development, load Vite dev server; in production, load built index from app/dist
  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../app/dist/index.html')}`;

  mainWindow.loadURL(startURL);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Create tray icon
  createTray();

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in default browser
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Window events
  mainWindow.on('close', (event) => {
    if (tray && appConfig.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });


}



function createTray() {
  tray = new Tray(path.join(__dirname, '../public/icons/tray-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('All-in-One Messenger');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// IPC Handlers for React communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('minimize-app', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-app', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-app', () => {
  mainWindow.close();
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// Show native system notifications
ipcMain.handle('show-notification', (event, { title, body }) => {
  try {
    const n = new Notification({ title, body });
    n.show();
    return true;
  } catch (e) {
    return false;
  }
});

// In your main.js
ipcMain.on('new-notification', (event, data) => {
  // Handle notification
  mainWindow.webContents.send('notification-received', data);
});

ipcMain.on('new-message-detected', (event, data) => {
  // Handle new message detection
  mainWindow.webContents.send('message-detected', data);
});

// Configure per-account session partition
ipcMain.handle('configure-partition', (event, { partition, userAgent }) => {
  try {
    const sess = session.fromPartition(partition);
    if (userAgent) {
      sess.setUserAgent(userAgent);
    }
    // Auto-allow common web permissions (notifications, media)
    sess.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const allowAll = ['notifications', 'media', 'camera', 'microphone', 'fullscreen', 'pointerLock'];
      if (allowAll.includes(permission)) {
        callback(true);
        return;
      }
      callback(true);
    });
    return true;
  } catch (e) {
    return false;
  }
});

// Handle multiple windows for floating webviews
ipcMain.handle('create-floating-window', (event, { url, title, width, height }) => {
  const floatingWindow = new BrowserWindow({
    width: width || 800,
    height: height || 600,
    parent: mainWindow,
    modal: false,
    frame: true,
    webPreferences: {
      partition: 'persist:webviews',
    }
  });

  floatingWindow.loadURL(url);
  floatingWindow.setTitle(title);

  return floatingWindow.id;
});

app.whenReady().then(() => {
  // Ensure Windows notifications work
  try { app.setAppUserModelId('com.yourcompany.yourapp'); } catch { }
  // Optimize memory and background throttling
  app.commandLine.appendSwitch('disable-site-isolation-trials'); // Save memory (trade-off: security)
  app.commandLine.appendSwitch('renderer-process-limit', '100'); // Limit processes
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer'); // Performance
  // Throttle background timers to save CPU
  app.commandLine.appendSwitch('enable-background-timer-throttling');
  app.commandLine.appendSwitch('enable-background-occlusion');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});