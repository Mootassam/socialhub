'use strict';

const {
  app, BrowserWindow, Menu, Tray, shell, ipcMain,
  session, Notification, nativeImage
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const isDev = process.env.NODE_ENV === 'development';

// ─── App User Model ID (Windows notifications) ────────────────────────────────
try { app.setAppUserModelId('com.yourcompany.socialhub'); } catch {}

// ─── Auto Updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload = false;
const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// ─── Performance Switches ─────────────────────────────────────────────────────
// Disable Chromium native notification UI (we handle via Electron Notification)
app.commandLine.appendSwitch('disable-notifications');
// Skip GPU process for reduced RAM (fallback to software)
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Reduce IPC overhead on Windows
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  minimizeToTray: true,
  pollIntervalMs: 8000, // 8 s — balanced between responsiveness and CPU
  showNativeNotifications: true,
};

let appSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH(), 'utf8');
    appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    appSettings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(data) {
  try {
    appSettings = { ...appSettings, ...data };
    fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(appSettings, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── Provider Names (single source of truth) ──────────────────────────────────
const PROVIDER_NAMES = {
  1: 'WhatsApp',
  2: 'Telegram',
  3: 'Line',
  4: 'Instagram',
  5: 'Messenger',
  6: 'Facebook',
  8: 'Discord',
  10: 'TikTok',
  12: 'Teams',
  13: 'Tinder',
  14: 'Snapchat',
  15: 'LinkedIn',
  16: 'Gmail',
  17: 'VK',
  19: 'DeepSeek',
  20: 'ChatGPT',
  21: 'Google Sheets',
  22: 'Google Voice',
  23: 'X (Twitter)',
  24: 'Zalo',
  25: 'Hangouts',
  26: 'TextNow',
  27: 'Text Free',
  28: 'Slack',
};

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
// { providerId, accountId } currently visible — suppresses toasts when user is looking
let activeContext = { providerId: null, accountId: null };

// ─── createWindow ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../public/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      // Each webview uses its own named partition; main window keeps default session
      partition: 'persist:mainapp',
      backgroundThrottling: true,     // Save CPU when window is hidden
      spellcheck: false,              // Minor perf win
    },
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  mainWindow.maximize();

  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../app/dist/index.html')}`;

  mainWindow.loadURL(startURL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  // External links → default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close → hide to tray (if setting enabled)
  mainWindow.on('close', (event) => {
    if (tray && appSettings.minimizeToTray && !app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Window focus / blur — renderer uses these for precise notification suppression
  // (avoids the race condition of polling isFocused() inside background intervals)
  const sendWindowState = (focused) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focus-changed', { focused });
    }
  };
  mainWindow.on('focus', () => sendWindowState(true));
  mainWindow.on('blur',  () => sendWindowState(false));
  mainWindow.on('show',  () => sendWindowState(true));
  mainWindow.on('hide',  () => sendWindowState(false));

  createTray();
  setupAutoUpdaterEvents();

  // After a short delay check for updates
  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  }
}

// ─── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../public/icons/tray-icon.png');
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(__dirname, '../public/icons/icon.png'));

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Show SocialHub',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuiting = true; app.quit(); },
    },
  ]);

  tray.setToolTip('SocialHub — All-in-One Messenger');
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── Auto Updater Events ───────────────────────────────────────────────────────
function setupAutoUpdaterEvents() {
  const send = (ch, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ch, data);
    }
  };

  autoUpdater.on('update-available', (info) => send('update-available', info));
  autoUpdater.on('update-not-available', (info) => send('update-not-available', info));
  autoUpdater.on('download-progress', (p) => send('download-progress', p));
  autoUpdater.on('update-downloaded', (info) => send('update-downloaded', info));
  autoUpdater.on('error', (err) => send('update-error', err.toString()));
}

// ─── Background Webview Pool ───────────────────────────────────────────────────
// key: "providerId-accountId"  →  { win (BrowserWindow hidden), interval (NodeJS.Timeout),
//                                   lastCount, lastMessage, lastNotifiedAt, lastMessageHash }
const bgPool = new Map();

function makeKey(providerId, accountId) {
  return `${providerId}-${accountId}`;
}

function hashStr(str) {
  // djb2 — fast, good enough for dedup
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

// ─── IPC — Window Controls ────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('minimize-app', () => mainWindow?.minimize());
ipcMain.handle('maximize-app', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('close-app', () => mainWindow?.close());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

// ─── IPC — Settings ───────────────────────────────────────────────────────────
ipcMain.handle('load-settings', () => ({ ...appSettings }));
ipcMain.handle('save-settings', (_e, data) => saveSettings(data));

// ─── IPC — Active Context (notification suppression) ─────────────────────────
ipcMain.on('active-context', (_e, data) => {
  try {
    const { providerId, accountId } = data || {};
    activeContext = { providerId: Number(providerId), accountId: Number(accountId) };
  } catch {}
});

// ─── IPC — Native Notification ────────────────────────────────────────────────
ipcMain.handle('show-notification', (_e, { title, body, icon }) => {
  try {
    const opts = { title: String(title), body: String(body) };
    if (icon) {
      try { opts.icon = nativeImage.createFromPath(icon); } catch {}
    }
    const n = new Notification(opts);
    n.show();
    return true;
  } catch {
    return false;
  }
});

// ─── IPC — Configure Session Partition ────────────────────────────────────────
ipcMain.handle('configure-partition', (_e, { partition, userAgent }) => {
  try {
    const sess = session.fromPartition(partition);
    if (userAgent) sess.setUserAgent(userAgent);

    // Block native web notifications — we handle them ourselves
    sess.setPermissionRequestHandler((wc, permission, callback) => {
      callback(permission !== 'notifications');
    });

    // Block crash-reporting telemetry to reduce network noise
    sess.webRequest.onBeforeRequest({ urls: ['*://crashreports.chromium.org/*'] }, (_d, cb) => cb({ cancel: true }));

    return true;
  } catch {
    return false;
  }
});

// ─── IPC — Get Preload Path ────────────────────────────────────────────────────
ipcMain.handle('get-preload-path', () => {
  const p = path.join(__dirname, 'preload.js');
  try { return pathToFileURL(p).toString(); } catch { return `file://${p.replace(/\\/g, '/')}`; }
});

// ─── Background Polling ────────────────────────────────────────────────────────
ipcMain.handle('start-background', async (_e, { providerId, accountId, url, partition, userAgent }) => {
  try {
    const key = makeKey(providerId, accountId);
    if (bgPool.has(key)) return true; // already running

    providerId = Number(providerId);
    accountId  = Number(accountId);

    const sess = session.fromPartition(partition || `persist:pv_${providerId}_acc_${accountId}`);
    if (userAgent) sess.setUserAgent(userAgent);

    // Block web notifications inside background Windows
    sess.setPermissionRequestHandler((_wc, perm, cb) => cb(perm !== 'notifications'));

    // Hidden BrowserWindow approach (BrowserView is deprecated in Electron 28+)
    const hiddenWin = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        partition: partition || `persist:pv_${providerId}_acc_${accountId}`,
        userAgent: userAgent || undefined,
        backgroundThrottling: false, // Must stay active to detect messages
        nodeIntegration: false,
        contextIsolation: false, // simpler for JS injection
        webviewTag: false,
      },
      skipTaskbar: true,
    });

    hiddenWin.webContents.loadURL(url || 'about:blank').catch(() => {});

    const providerName = PROVIDER_NAMES[providerId] || `Provider ${providerId}`;

    const entry = {
      win: hiddenWin,
      interval: null,
      lastCount: 0,
      lastMessage: null,
      lastMessageHash: 0,
      lastNotifiedAt: 0,
    };
    bgPool.set(key, entry);

    const pollIntervalMs = appSettings.pollIntervalMs || 8000;

    const checkFn = async () => {
      try {
        const wc = hiddenWin.webContents;
        if (!wc || wc.isDestroyed()) return;

        // ── Universal: read title-based unread count ──────────────────────────
        const titleResult = await wc.executeJavaScript(
          `(function(){try{const m=document.title.match(/\\(([0-9]+)\\)/);return m?parseInt(m[1],10):0}catch(e){return 0}})()`,
          true
        ).catch(() => 0);

        let count = typeof titleResult === 'number' ? titleResult : 0;
        let message = null;

        // ── Provider-specific message sniffing ────────────────────────────────
        if (providerId === 1) {
          // WhatsApp — get last incoming message text
          const r = await wc.executeJavaScript(
            `(function(){try{
              const els=document.querySelectorAll('.message-in .selectable-text,.message-in .copyable-text');
              if(els&&els.length)return (els[els.length-1].innerText||'').slice(0,240);
              return null}catch(e){return null}})()`,
            true
          ).catch(() => null);
          if (r) message = r;

        } else if (providerId === 2) {
          // Telegram — get last incoming message + sender
          const r = await wc.executeJavaScript(
            `(function(){try{
              const items=document.querySelectorAll('.chat-message.is-in,.message.message-in,[class*="message-in"]');
              if(!items||!items.length)return null;
              const last=items[items.length-1];
              const nameEl=last.querySelector('.peer-title,.sender-name,[class*="title"]');
              const textEl=last.querySelector('.message-content p,.text-content,[class*="text"]');
              const name=nameEl?(nameEl.innerText||'').trim():null;
              const text=textEl?(textEl.innerText||'').slice(0,240).trim():null;
              if(text)return JSON.stringify({name,text});
              return null}catch(e){return null}})()`,
            true
          ).catch(() => null);
          if (r) {
            try {
              const parsed = JSON.parse(r);
              message = parsed.name ? `${parsed.name}: ${parsed.text}` : parsed.text;
            } catch { message = r; }
          }

        } else if (providerId === 5 || providerId === 6) {
          // Messenger / Facebook
          const r = await wc.executeJavaScript(
            `(function(){try{
              const els=document.querySelectorAll('[role="main"] [aria-label*="message"],[role="row"]');
              if(els&&els.length)return (els[els.length-1].innerText||'').slice(0,240);
              return null}catch(e){return null}})()`,
            true
          ).catch(() => null);
          if (r) message = r;
        }
        // Other providers rely on title count alone

        // ── Deduplication ─────────────────────────────────────────────────────
        const msgHash = message ? hashStr(message) : 0;
        const countIncreased  = count > entry.lastCount;
        const messageIsNew    = message && msgHash !== entry.lastMessageHash;
        const now             = Date.now();
        const cooldownOk      = (now - entry.lastNotifiedAt) > 4000;
        const userIsViewing   = mainWindow && mainWindow.isFocused()
                                && activeContext.providerId === providerId
                                && activeContext.accountId  === accountId;

        const shouldNotify = (countIncreased || messageIsNew) && !userIsViewing && cooldownOk;

        // Update tracker state
        if (countIncreased)  entry.lastCount = count;
        if (messageIsNew)    { entry.lastMessage = message; entry.lastMessageHash = msgHash; }

        if (countIncreased || messageIsNew) {
          // Always update renderer badge
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('message-detected', {
              providerId, accountId,
              count: entry.lastCount,
              message: entry.lastMessage,
            });
          }

          // Native OS toast
          if (shouldNotify && appSettings.showNativeNotifications) {
            const body  = entry.lastMessage || `${count} new message${count !== 1 ? 's' : ''}`;
            const n = new Notification({
              title: `${providerName}`,
              body,
            });
            n.show();
            entry.lastNotifiedAt = now;
          }
        }
      } catch {
        // Ignore individual poll errors silently
      }
    };

    // Stagger first poll to avoid a burst when many accounts start simultaneously
    const stagger = (Number(accountId) % 20) * 400; // 0–7600 ms stagger
    setTimeout(() => {
      if (bgPool.has(key)) {
        checkFn();
        entry.interval = setInterval(checkFn, pollIntervalMs);
      }
    }, stagger);

    return true;
  } catch (e) {
    log.error('start-background error', e);
    return false;
  }
});

ipcMain.handle('stop-background', (_e, { providerId, accountId }) => {
  try {
    const key = makeKey(providerId, accountId);
    const entry = bgPool.get(key);
    if (!entry) return true;

    if (entry.interval) clearInterval(entry.interval);

    if (entry.win && !entry.win.isDestroyed()) {
      entry.win.destroy(); // Free all RAM for this hidden window
    }

    bgPool.delete(key);
    return true;
  } catch {
    return false;
  }
});

// ─── IPC — Clear All Data (Factory Reset) ─────────────────────────────────────
ipcMain.handle('clear-all-data', async () => {
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();

    const partitionsPath = path.join(app.getPath('userData'), 'Partitions');
    if (fs.existsSync(partitionsPath)) {
      fs.rmSync(partitionsPath, { recursive: true, force: true });
    }

    return true;
  } catch (e) {
    log.error('clear-all-data error', e);
    return false;
  }
});

// ─── IPC — Auto Updater ───────────────────────────────────────────────────────
ipcMain.handle('check-for-updates', () => { if (!isDev) autoUpdater.checkForUpdates().catch(() => {}); });
ipcMain.handle('start-download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install-update', () => autoUpdater.quitAndInstall());

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  loadSettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;

  // Destroy all background windows to free memory
  for (const [key, entry] of bgPool) {
    try {
      if (entry.interval) clearInterval(entry.interval);
      if (entry.win && !entry.win.isDestroyed()) entry.win.destroy();
    } catch {}
    bgPool.delete(key);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
