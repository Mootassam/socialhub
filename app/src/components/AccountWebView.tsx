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

  // Force a fresh webview per account to ensure correct isolated session
  const partition = `persist:pv_${providerId}_acc_${accountId}`;

  // Modern Chrome UA to satisfy services like WhatsApp Web
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const [preloadPath, setPreloadPath] = useState<string>('');


  // Store latest props in refs to avoid stale closures in interval
  const onUnreadChangeRef = useRef(onUnreadChange);
  const visibleRef = useRef(visible);
  
  useEffect(() => {
    onUnreadChangeRef.current = onUnreadChange;
    visibleRef.current = visible;
  }, [onUnreadChange, visible]);

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

  const lastCountRef = useRef<number>(-1);

  // Function to check for new notifications
  const checkForNotifications = async () => {
    const wv = webviewRef.current;
    if (!wv) return;

    // If hidden and background updates disabled, do nothing
    if (!visibleRef.current && !backgroundUpdatesEnabled) return;

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
        case 5: // Messenger
        case 6: // Facebook
          count = await checkMessengerNotifications(wv);
          break;
        case 8: // Discord
          count = await checkDiscordNotifications(wv);
          break;
        case 28: // Slack
           count = await checkSlackNotifications(wv);
           break;
        case 16: // Gmail
           count = await checkGmailNotifications(wv);
           break;
        // Add more providers as needed
        default:
          // Generic check for unread indicators
          count = await checkGenericNotifications(wv);
      }

      // Only update if changed to prevent re-render spam
      if (count !== lastCountRef.current) {
         lastCountRef.current = count;
         // console.log(`[AccountWebView] Provider ${providerId} Account ${accountId} Count: ${count}`);
         if (onUnreadChangeRef.current) {
           onUnreadChangeRef.current(providerId, accountId, count);
         }
      }
    } catch (error) {
      // console.error('Error checking notifications:', error);
    }
  };

  // Helper to execute JS with timeout to prevent hanging
  const executeJsSafe = async (wv: ElectronWebviewTag, code: string, timeoutMs = 500): Promise<any> => {
     if (typeof (wv as any).executeJavaScript !== 'function') return null;
     
     return Promise.race([
        (wv as any).executeJavaScript(code, true),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Script timeout')), timeoutMs))
     ]).catch(() => null); // Return null on timeout/error to avoid throwing
  };

  // WhatsApp specific notification detection
  const checkWhatsAppNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            // Method 1: Title check (Most reliable)
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) {
              return parseInt(titleMatch[1], 10);
            }

            // Method 2: Aria labels (Standard WhatsApp Web)
            const unreadElements = document.querySelectorAll('[aria-label*="unread"]');
            let total = 0;
            for (const el of unreadElements) {
               if (el.offsetParent === null) continue; // Must be visible
               const text = el.innerText || el.textContent || "";
               const num = parseInt(text, 10);
               if (!isNaN(num)) total += num;
               else total += 1;
            }
            if (total > 0) return total;

            // Method 3: Icon badges
            const badges = document.querySelectorAll('span[data-icon="unread-count"], ._1pJ9J'); 
            if (badges.length > 0) return badges.length;
            
            // Method 4: Generic class search for unread numbers
            // WhatsApp often uses specific classes for green badges
            const potentialBadges = document.querySelectorAll('span[class*="_2H6nH"]'); // Example class, changes often
            for (const el of potentialBadges) {
                if (parseInt(el.innerText, 10) > 0) return parseInt(el.innerText, 10);
            }

            return 0;
          } catch(e) { return 0; }
        })()
      `, 1000); // 1s timeout
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Telegram notification detection
  const checkTelegramNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            // Method 1: Title check
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) return parseInt(titleMatch[1], 10);

            // Method 2: Comprehensive DOM check
            let total = 0;
            const selectors = [
               '.badge:not(.muted)', 
               '.unread-count', 
               '.counter', 
               '.peer-badge', 
               '.ChatBadge',
               'div[class*="badge"]',
               'span[class*="badge"]',
               '.unread',
               '[class*="unread"]'
            ];

            const elements = document.querySelectorAll(selectors.join(','));
            for (const el of elements) {
               if (el.offsetParent === null) continue;
               
               // Skip muted/grey badges
               const style = window.getComputedStyle(el);
               if (style.backgroundColor.includes('128, 128, 128') || style.backgroundColor.includes('rgba(0, 0, 0, 0)')) continue;
               
               const text = el.innerText || el.textContent || "";
               const num = parseInt(text, 10);
               
               if (!isNaN(num)) {
                 total += num;
               } else if (text.trim() !== "") {
                 // Maybe a dot or non-numeric indicator
                 total += 1;
               }
            }
            return total;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Messenger/Facebook notification detection
  const checkMessengerNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) return parseInt(titleMatch[1], 10);

            const unreadLabels = document.querySelectorAll('[aria-label*="unread"]');
            if (unreadLabels.length > 0) return unreadLabels.length;
            
            const statusRoles = document.querySelectorAll('[role="status"]');
            for (const el of statusRoles) {
               if (el.innerText && !isNaN(parseInt(el.innerText))) {
                  return parseInt(el.innerText, 10);
               }
            }
            return 0;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Discord notification detection
  const checkDiscordNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
             // Title check
             if (document.title.match(/^[\\*•]/) || document.title.match(/[\\*•] /)) return 1;
             const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
             if (titleMatch && titleMatch[1]) return parseInt(titleMatch[1], 10);

             // Badges
             const badges = document.querySelectorAll('div[class*="numberBadge"], div[class*="mention"], div[class*="lowerBadge"]');
             let total = 0;
             for (const el of badges) {
                if (!el.innerText) continue;
                const num = parseInt(el.innerText, 10);
                if (!isNaN(num)) total += num;
                else total += 1;
             }
             
             // Unread pill bars (white bars in channel list)
             const unreadBars = document.querySelectorAll('div[class*="unreadBar"], div[class*="item"] > div[class*="pill"] span[style*="opacity: 1"]');
             if (unreadBars.length > 0 && total === 0) total += 1;

             return total;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Slack notification detection
  const checkSlackNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            if (document.title.match(/^[\\*!]/) || document.title.match(/[\\*!] /)) return 1;
            
            const badges = document.querySelectorAll('.c-mention_badge, .p-channel_sidebar__badge, .p-ia__view_header__badge');
            let total = 0;
            for (const el of badges) {
               const num = parseInt(el.innerText, 10);
               if (!isNaN(num)) total += num;
               else total += 1;
            }
            return total;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Gmail notification detection
  const checkGmailNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            // Title check (e.g. "Inbox (1) - ...")
            const titleMatch = document.title.match(/Inbox(?:\\s+\\(([0-9]+)\\))?/);
            if (titleMatch && titleMatch[1]) return parseInt(titleMatch[1], 10);
            
            // Aria labels (e.g. "Inbox, 2 unread")
            const unreadLinks = document.querySelectorAll('a[aria-label*="unread"], div[aria-label*="unread"]');
            for (const el of unreadLinks) {
                const label = el.getAttribute('aria-label');
                const match = label.match(/([0-9]+)\\s+unread/);
                if (match && match[1]) return parseInt(match[1], 10);
            }
            
            // Legacy/Basic HTML mode
            const bsU = document.querySelector('.bsU');
            if (bsU && bsU.innerText) {
                return parseInt(bsU.innerText, 10);
            }

            return 0;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  // Generic notification detection for other providers
  const checkGenericNotifications = async (wv: ElectronWebviewTag): Promise<number> => {
    try {
      const result = await executeJsSafe(wv, `
        (function() {
          try {
            const titleMatch = document.title.match(/\\(([0-9]+)\\)/);
            if (titleMatch && titleMatch[1]) {
               return parseInt(titleMatch[1], 10);
            }
            
            if (document.title.match(/^[\\*•!]/) || document.title.match(/[\\*•!] /)) {
               return 1;
            }

            const indicators = [
               '.unread', 
               '.badge', 
               '[aria-label*="unread"]', 
               '.notification-badge',
               'div[class*="badge"]',
               'span[class*="badge"]',
               '.mail-status-unread', 
               '.unread-count',
               '.gs.ue', // Gmail unread row
               '.zF', // Gmail unread count in some views
               '[data-testid="unread-count"]'
            ];
            let total = 0;
            
            const allElements = new Set();
            for (const selector of indicators) {
               const els = document.querySelectorAll(selector);
               els.forEach(el => allElements.add(el));
            }

            for (const el of Array.from(allElements)) {
               if (el.offsetParent === null) continue;
               
               const text = el.innerText || el.textContent;
               const num = parseInt(text, 10);
               if (!isNaN(num)) {
                  total += num;
               } else {
                  total += 1;
               }
            }
            
            return total;
          } catch(e) { return 0; }
        })()
      `, 1000);
      return typeof result === 'number' ? result : 0;
    } catch (error) { return 0; }
  };

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    // Use a self-rescheduling timeout loop instead of setInterval to avoid overlaps
    let timeoutId: any;
    let isMounted = true;

    const runCheck = async () => {
      if (!isMounted) return;
      await checkForNotifications();
      if (isMounted) {
        timeoutId = setTimeout(runCheck, 2000);
      }
    };

    // Start the loop
    runCheck();

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
      isMounted = false;
      clearTimeout(timeoutId);
      if (wv) {
        wv.removeEventListener('dom-ready', handleDomReady);
        wv.removeEventListener('new-window', handleNewWindow);
      }
    };
  }, [providerId, accountId, partition, url]);

  // Manage visibility manually to keep state alive
  useEffect(() => {
     const wv = webviewRef.current;
     if (wv) {
        // If visible, show. If not visible but background updates enabled, hide (0x0). If not enabled, display none (might unload).
        if (visible) {
           wv.style.display = 'flex';
           wv.style.width = '100%';
           wv.style.height = '100%';
           wv.style.position = 'relative';
           wv.style.opacity = '1';
           wv.style.pointerEvents = 'auto';
           wv.style.zIndex = '1';
        } else if (backgroundUpdatesEnabled) {
           // Keep it in DOM but hidden
           wv.style.display = 'flex'; // Must be flex/block to render
           // Use 100% size to prevent layout throttling/virtualization issues
           wv.style.width = '100%'; 
           wv.style.height = '100%';
           wv.style.position = 'absolute';
           wv.style.top = '0';
           wv.style.left = '0';
           wv.style.opacity = '0';
           wv.style.pointerEvents = 'none';
           wv.style.zIndex = '-1';
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
      width: visible ? '100%' : (backgroundUpdatesEnabled ? '100%' : '1px'),
      height: visible ? '100%' : (backgroundUpdatesEnabled ? '100%' : '1px'),
      border: 'none',
      position: visible ? 'relative' : 'absolute',
      top: 0,
      left: 0,
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      zIndex: visible ? 1 : -1
    },
    preload: preloadPath
  } as any);
}
