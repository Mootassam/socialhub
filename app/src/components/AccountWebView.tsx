import { useEffect, useRef } from 'react';

type AccountWebViewProps = {
  providerId: number;
  accountId: number;
  url: string;
  onNotification?: (providerId: number, accountId: number) => void;
  onUnreadChange?: (providerId: number, accountId: number, count: number) => void;
  visible?: boolean;
  backgroundUpdatesEnabled?: boolean;
};

// Minimal typing for the Electron <webview> element
interface ElectronWebviewTag extends HTMLElement {
  src: string;
  partition?: string;
  reload: () => void;
  addEventListener: (name: string, cb: (...args: any[]) => void) => void;
  removeEventListener: (name: string, cb: (...args: any[]) => void) => void;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<any>;
  openDevTools: () => void;
}

export default function AccountWebView({ 
  providerId, 
  accountId, 
  url,
  onNotification,
  onUnreadChange,
  visible = true,
  backgroundUpdatesEnabled = true,
}: AccountWebViewProps) {
  const webviewRef = useRef<ElectronWebviewTag | null>(null);
  const notificationIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Force a fresh webview per account to ensure correct isolated session
  const partition = `persist:pv_${providerId}_acc_${accountId}`;

  // Modern Chrome UA to satisfy services like WhatsApp Web
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Function to check for new notifications
  const checkForNotifications = async () => {
    const wv = webviewRef.current;
    if (!wv) return;

    // If hidden and background updates disabled, do nothing
    if (!visible && !backgroundUpdatesEnabled) return;

    try {
      // Different notification detection for each provider
      switch (providerId) {
        case 1: // WhatsApp
          await checkWhatsAppNotifications(wv);
          break;
        case 2: // Telegram
          await checkTelegramNotifications(wv);
          break;
        // Add more providers as needed
        default:
          // Generic check for unread indicators
          await checkGenericNotifications(wv);
      }
    } catch (error) {
      // console.error('Error checking notifications:', error);
    }
  };

  // WhatsApp specific notification detection
  const checkWhatsAppNotifications = async (wv: ElectronWebviewTag) => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return;
      
      const hasUnread = await wv.executeJavaScript(`
        (function() {
          try {
             // Method 1: Check for unread message badges
            const unreadBadges = document.querySelectorAll('[data-testid="unread-count"], [aria-label*="unread"], .unread');
            if (unreadBadges.length > 0) return true;

            // Method 2: Title check
            const title = document.title;
            const titleMatch = title.match(/\\(([0-9]+)\\)/);
            if (titleMatch) return true;
            
            return false;
          } catch(e) { return false; }
        })()
      `, true);

      if (hasUnread && onNotification) {
        onNotification(providerId, accountId);
      }
    } catch (error) {}
  };

  // Telegram notification detection
  const checkTelegramNotifications = async (wv: ElectronWebviewTag) => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return;
      const hasUnread = await wv.executeJavaScript(`
        (function() {
          try {
            const unreadBadges = document.querySelectorAll('.badge:not(.muted), .unread, .icon-badge');
            const unreadCount = document.querySelectorAll('.unread-count, .counter');
            return unreadBadges.length > 0 || unreadCount.length > 0;
          } catch(e) { return false; }
        })()
      `, true);

      if (hasUnread && onNotification) {
        onNotification(providerId, accountId);
      }
    } catch (error) {}
  };

  // Generic notification detection for other providers
  const checkGenericNotifications = async (wv: ElectronWebviewTag) => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return;
      const hasNotification = await wv.executeJavaScript(`
        (function() {
          try {
             // Check for notification in title (common pattern: (1) Page Title)
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch) return true;

            // Simple selector check
            const indicators = ['.unread', '.badge', '[aria-label*="unread"]'];
            for (const selector of indicators) {
               if (document.querySelector(selector)) return true;
            }
            return false;
          } catch(e) { return false; }
        })()
      `, true);

      if (hasNotification && onNotification) {
        onNotification(providerId, accountId);
      }
    } catch (error) {}
  };

  useEffect(() => {
    // Request main process to configure the session partition
    try {
      // @ts-ignore - exposed via preload
      window.electronAPI?.configurePartition?.(partition, { userAgent });
    } catch {}

    const wv = webviewRef.current;
    if (!wv) return;

    // Hook basic events
    const handleDidFinishLoad = () => {
      // Run an initial check once after load
      checkForNotifications();
    };

    // Listen for messages from the webview
    const handleIpcMessage = (event: any) => {
      if (event.channel === 'NEW_MESSAGE_DETECTED' && onNotification) {
        onNotification(providerId, accountId);
      }
    };

    // Title-based unread detection (common pattern: (n) at start)
    const handleTitleUpdated = (event: any) => {
      const title = event.title || '';
      const match = title.match(/^\s*\((\d+)\)/);
      if (match) {
        const count = parseInt(match[1], 10) || 0;
        if (onUnreadChange) {
          onUnreadChange(providerId, accountId, count);
        } else if (onNotification && count > 0) {
          onNotification(providerId, accountId);
        }
      }
    };

    wv.addEventListener('did-finish-load', handleDidFinishLoad);
    
    // @ts-ignore - Electron specific event
    wv.addEventListener('ipc-message', handleIpcMessage);
    wv.addEventListener('page-title-updated', handleTitleUpdated);

    // Set up polling interval
    // If visible: poll more frequently (e.g. 10s)
    // If hidden but background updates on: poll less frequently (e.g. 60s)
    // If hidden and background updates off: DO NOT POLL (handled inside checkForNotifications)
    
    const intervalTime = visible ? 10000 : 60000;
    
    if (notificationIntervalRef.current) clearInterval(notificationIntervalRef.current);
    
    if (visible || backgroundUpdatesEnabled) {
       notificationIntervalRef.current = setInterval(checkForNotifications, intervalTime);
    }

    return () => {
      if (notificationIntervalRef.current) {
        clearInterval(notificationIntervalRef.current);
      }
      
      wv.removeEventListener('did-finish-load', handleDidFinishLoad);
      // @ts-ignore - Electron specific event
      wv.removeEventListener('ipc-message', handleIpcMessage);
      wv.removeEventListener('page-title-updated', handleTitleUpdated);
    };
  }, [partition, onNotification, onUnreadChange, visible, backgroundUpdatesEnabled]);

  return (
    <webview
      ref={webviewRef as any}
      src={url}
      partition={partition}
      useragent={userAgent}
      allowpopups={true}
      className="webview-frame"
      style={{ width: '100%', height: '100%', border: 'none', display: visible ? 'flex' : 'none' }}
      nodeintegration={true}
    />
  );
}
