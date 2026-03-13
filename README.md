# MultiMessenger Pro

High-performance, all-in-one messenger desktop app with multi-account support. Built with **Electron** (BrowserView) and **React** (Zustand, Vite).

## Features

- **Multi-account**: Unlimited accounts per provider (e.g. 5+ WhatsApp, 8+ Telegram). Each account uses an isolated **BrowserView** (not webview/iframe) with its own session (partition).
- **Performance**: Inactive views hibernate after 5 minutes to save RAM; session persists so switching back is quick. No full reloads on account switch.
- **UI**: Sidebar (providers) + account tabs, dark/light/system theme, settings (add/remove providers, theme, minimize to tray, factory reset).
- **Notifications**: Desktop notifications only for non-muted accounts; unread counts exclude muted chats. Badge on dock/taskbar.
- **Persistence**: Accounts and settings stored with **electron-store**; sessions in Electron partitions.

## Supported providers (15, easy to extend)

WhatsApp, Telegram, Facebook Messenger, Instagram, Discord, Slack, Microsoft Teams, LinkedIn, Gmail, X (Twitter), Line, VK, Signal, Google Chat, Skype. Add more in `app/src/data/providers.ts`.

## Scripts

```bash
# Install
npm install
cd app && npm install

# Development (React dev server + Electron)
npm run dev

# Build React then package with Electron Builder
npm run build
```

## Project layout

- `electron/main.js` – Main process: window, tray, BrowserView manager, hibernation, IPC, electron-store, notifications.
- `electron/preload.js` – Exposes safe API to renderer (viewShow, store, notifications, updates).
- `app/src/App.tsx` – Root UI: sidebar, account tabs, settings modal.
- `app/src/state/store.ts` – Zustand store; persisted via IPC to main.
- `app/src/data/providers.ts` – Provider list (id, name, icon, color, url).
- `app/src/components/ViewContainer.tsx` – Tells main which view to show; handles unread updates and load error + reload.

## Security

- `nodeIntegration: false`, `contextIsolation: true` for renderer.
- BrowserViews use `sandbox: true`, no node in web content.
- Sessions stored in Electron’s partition paths (no custom secrets in store).

## Icons

Place provider icons under `app/public/provider/` (e.g. `whatsapp.png`). If missing, the UI falls back to the first letter of the provider name.
