import React, { useEffect, useRef ,useState} from 'react';

type AccountWebViewProps = {
  providerId: number;
  accountId: number;
  url: string;
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
  onUnreadChange,

  visible = true,
  backgroundUpdatesEnabled = true
}: AccountWebViewProps) {
  const webviewRef = useRef<ElectronWebviewTag | null>(null);
  const notificationIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Force a fresh webview per account to ensure correct isolated session
  const partition = `persist:pv_${providerId}_acc_${accountId}`;

  // Modern Chrome UA to satisfy services like WhatsApp Web
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const [preloadPath, setPreloadPath] = useState<string>('');


  useEffect(() => {
    // Fetch preload path safely
    if ((window as any).electronAPI?.getPreloadPath) {
      Promise.resolve((window as any).electronAPI.getPreloadPath())
        .then((path: any) => {
          if (typeof path === 'string') setPreloadPath(path);
        })
        .catch(() => {});
    }
  }, []);

  // Function to check for new notifications
  const checkForNotifications = async () => {
    const wv = webviewRef.current;
    if (!wv) return;

    // If hidden and background updates disabled, do nothing
    if (!visible && !backgroundUpdatesEnabled) return;

    try {
      let count = 0;
      // Different notification detection for each provider
      switch (providerId) {
        case 1: // WhatsApp
          count = await checkWhatsAppNotifications(wv);
          break;
        case 2: // Telegram
          count = await checkTelegramNotifications(wv);
          break;
        // Add more providers as needed
        default:
          // Generic check for unread indicators
          count = await checkGenericNotifications(wv);
      }

      if (onUnreadChange) {
        onUnreadChange(providerId, accountId, count);
      }
    } catch (error) {
      // console.error('Error checking notifications:', error);
    }
  };

  // WhatsApp specific notification detection
  const checkWhatsAppNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return 0;
      
      return await wv.executeJavaScript(`
        (function() {
          try {
            // Method 1: Title check (Most reliable)
            // WhatsApp title format: (N) WhatsApp
            const title = document.title;
            const titleMatch = title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) {
              return parseInt(titleMatch[1], 10);
            }

            // Method 2: DOM Check
            const unreadBadges = document.querySelectorAll('[aria-label*="unread"], .unread, [data-testid="icon-unread-count"]');
            if (unreadBadges.length > 0) {
               // Try to parse text from badge if it exists
               for (const badge of unreadBadges) {
                  const text = badge.innerText || badge.textContent;
                  const num = parseInt(text, 10);
                  if (!isNaN(num)) return num;
               }
               return 1; // Fallback if badge exists but no number
            }
            
            return 0;
          } catch(e) { return 0; }
        })()
      `, true);
    } catch (error) { return 0; }
  };

  // Telegram notification detection
  const checkTelegramNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return 0;
      return await wv.executeJavaScript(`
        (function() {
          try {
            // Method 1: Title check
            const title = document.title;
            const titleMatch = title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) {
              return parseInt(titleMatch[1], 10);
            }

            // Method 2: Badge check
            const badges = document.querySelectorAll('.badge:not(.muted), .unread-count, .counter');
            let total = 0;
            for (const badge of badges) {
               const text = badge.innerText || badge.textContent;
               const num = parseInt(text, 10);
               if (!isNaN(num)) {
                 total += num; // Telegram might have multiple chats with badges? Usually aggregate is in title
               } else {
                 total += 1;
               }
            }
            return total > 0 ? total : 0;
          } catch(e) { return 0; }
        })()
      `, true);
    } catch (error) { return 0; }
  };

  // Generic notification detection for other providers
  const checkGenericNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      if (typeof (wv as any).executeJavaScript !== 'function') return 0;
      return await wv.executeJavaScript(`
        (function() {
          try {
             // Check for notification in title (common pattern: (1) Page Title)
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) {
               return parseInt(titleMatch[1], 10);
            }
            
            // Check for indirect indicators in title (e.g. "* Slack" or "• Discord")
            if (document.title.match(/^[\\*•]/) || document.title.match(/[\\*•] /)) {
               return 1;
            }

            // Simple selector check
            const indicators = ['.unread', '.badge', '[aria-label*="unread"]'];
            for (const selector of indicators) {
               const el = document.querySelector(selector);
               if (el) {
                  const text = el.innerText || el.textContent;
                  const num = parseInt(text, 10);
                  if (!isNaN(num)) return num;
                  return 1;
               }
            }
            return 0;
          } catch(e) { return 0; }
        })()
      `, true);
    } catch (error) { return 0; }
  };

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    // Set up notification check interval
    notificationIntervalRef.current = setInterval(checkForNotifications, 2000);

    const handleDomReady = async () => {
      // Inject custom CSS/JS if needed
      // wv.insertCSS(...)
      
      // Configure session
      if ((window as any).electronAPI?.configurePartition) {
         await (window as any).electronAPI.configurePartition(partition, userAgent);
      }
    };

    const handleNewWindow = (e: any) => {
      // Open external links in default browser
      if (e.url && !e.url.includes('localhost')) {
         if ((window as any).electronAPI?.openExternal) {
            (window as any).electronAPI.openExternal(e.url);
         }
      }
    };

    wv.addEventListener('dom-ready', handleDomReady);
    wv.addEventListener('new-window', handleNewWindow);

    return () => {
      if (notificationIntervalRef.current) clearInterval(notificationIntervalRef.current);
      wv.removeEventListener('dom-ready', handleDomReady);
      wv.removeEventListener('new-window', handleNewWindow);
    };
  }, [providerId, accountId, partition]); // Re-run if account changes

  // Manage visibility manually to keep state alive
  useEffect(() => {
     const wv = webviewRef.current;
     if (wv) {
        // If visible, show. If not visible but background updates enabled, hide (0x0). If not enabled, display none (might unload).
        if (visible) {
           wv.style.display = 'flex';
           wv.style.width = '100%';
           wv.style.height = '100%';
        } else if (backgroundUpdatesEnabled) {
           // Keep it in DOM but hidden
           wv.style.display = 'flex'; // Must be flex/block to render
           wv.style.width = '1px';
           wv.style.height = '1px';
           wv.style.position = 'absolute';
           wv.style.opacity = '0';
           wv.style.pointerEvents = 'none';
        } else {
           // This effectively unmounts/hides it fully
           wv.style.display = 'none';
        }
     }
  }, [visible, backgroundUpdatesEnabled]);

  if (!url || url === 'about:blank') {
     // If we really shouldn't load anything
     if (!backgroundUpdatesEnabled && !visible) return null;
     // If we should load but url is blank?
     if (url === 'about:blank') return null; 
  }

  // Use the <webview> tag (Electron specific)
  // We use dangerouslySetInnerHTML or React.createElement because <webview> is not a standard HTML tag
  return React.createElement('webview', {
    ref: webviewRef,
    src: url,
    partition: partition,
    useragent: userAgent,
    allowpopups: 'true',
    style: { 
      display: visible ? 'flex' : (backgroundUpdatesEnabled ? 'flex' : 'none'),
      width: visible ? '100%' : '1px',
      height: visible ? '100%' : '1px',
      border: 'none',
      position: visible ? 'relative' : 'absolute',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none'
    },
    preload: preloadPath
  } as any);
}
