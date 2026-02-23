// Type definitions for Electron API exposed via preload script

export interface ElectronAPI {
  // App info
  getAppVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
  
  // Window controls
  minimizeApp: () => Promise<void>;
  maximizeApp: () => Promise<void>;
  closeApp: () => Promise<void>;
  
  // External links
  openExternal: (url: string) => Promise<void>;
  
  // WebView management
  getPreloadPath: () => Promise<string>;
  configurePartition: (partition: string, userAgent?: string) => Promise<boolean>;
  
  // Notifications
  sendNotification: (providerId: number, accountId: number) => void;
  showNotification: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
  
  // Auto Updater
  checkForUpdates: () => Promise<void> | void;
  startDownloadUpdate: () => Promise<void> | void;
  quitAndInstallUpdate: () => Promise<void> | void;
  onCheckingForUpdate: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
  
  // Data management
  clearAllData: () => Promise<boolean>;
  
  // Message handling
  sendMessageDetected: (data: unknown) => void;
  onMessageDetected: (callback: (data: unknown) => void) => () => void;
  onNotificationReceived: (callback: (data: unknown) => void) => () => void;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
