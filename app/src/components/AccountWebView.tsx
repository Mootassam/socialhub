import React, { useEffect, useRef } from 'react';

// ─── Preload path — module-level singleton ────────────────────────────────────
let cachedPreloadPath: string | null = null;
let preloadPathPromise: Promise<string> | null = null;

const getPreloadPath = (): Promise<string> => {
  if (cachedPreloadPath !== null) return Promise.resolve(cachedPreloadPath);
  if (preloadPathPromise)         return preloadPathPromise;

  preloadPathPromise = (async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.getPreloadPath) {
        const p = await api.getPreloadPath();
        if (typeof p === 'string' && p.length > 0) {
          cachedPreloadPath = p;
          return p;
        }
      }
    } catch {}
    cachedPreloadPath = ''; // cache empty to stop retrying
    return '';
  })();

  return preloadPathPromise;
};

// ─── Pre-compile JS snippets as module-level constants ────────────────────────
// These are built once at module load time, never recreated on each render/poll.
const JS = {
  titleCount: `(function(){try{var m=document.title.match(/\\(([0-9]+)\\)/);return m?parseInt(m[1],10):0}catch(e){return 0}})()`,

  titleHasActivity: `(function(){try{return /^[*•!]/.test(document.title)||/[*•!] /.test(document.title)?1:0}catch(e){return 0}})()`,

  whatsappCount: `(function(){try{
    var m=document.title.match(/\\(([0-9]+)\\)/);if(m)return parseInt(m[1],10);
    var els=document.querySelectorAll('[aria-label*="unread"]'),t=0;
    for(var i=0;i<els.length;i++){if(els[i].offsetParent===null)continue;var n=parseInt(els[i].innerText,10);t+=isNaN(n)?1:n;}
    return t;
  }catch(e){return 0}})()`,

  whatsappMsg: `(function(){try{
    var els=document.querySelectorAll('.message-in .selectable-text,.message-in .copyable-text');
    if(els&&els.length)return (els[els.length-1].innerText||'').slice(0,240);
    return null;
  }catch(e){return null}})()`,

  telegramCount: `(function(){try{
    var m=document.title.match(/\\(([0-9]+)\\)/);if(m)return parseInt(m[1],10);
    var sel='.badge:not(.muted),.unread-count,.counter,.peer-badge,[class*="badge"],[class*="unread"]';
    var els=document.querySelectorAll(sel),t=0;
    for(var i=0;i<els.length;i++){
      if(els[i].offsetParent===null)continue;
      var bg=window.getComputedStyle(els[i]).backgroundColor;
      if(bg.indexOf('128, 128, 128')!==-1||bg==='rgba(0, 0, 0, 0)')continue;
      var n=parseInt(els[i].innerText,10);t+=isNaN(n)?1:n;
    }return t;
  }catch(e){return 0}})()`,

  messengerCount: `(function(){try{
    var m=document.title.match(/\\(([0-9]+)\\)/);if(m)return parseInt(m[1],10);
    var els=document.querySelectorAll('[aria-label*="unread"]');if(els.length>0)return els.length;
    var roles=document.querySelectorAll('[role="status"]');
    for(var i=0;i<roles.length;i++){var n=parseInt(roles[i].innerText,10);if(!isNaN(n))return n;}
    return 0;
  }catch(e){return 0}})()`,

  discordCount: `(function(){try{
    if(/^[*•]/.test(document.title)||/[*•] /.test(document.title))return 1;
    var m=document.title.match(/\\(([0-9]+)\\)/);if(m)return parseInt(m[1],10);
    var b=document.querySelectorAll('div[class*="numberBadge"],div[class*="mention"]'),t=0;
    for(var i=0;i<b.length;i++){var n=parseInt(b[i].innerText,10);t+=isNaN(n)?1:n;}
    return t;
  }catch(e){return 0}})()`,

  slackCount: `(function(){try{
    if(/^[*!]/.test(document.title))return 1;
    var b=document.querySelectorAll('.c-mention_badge,.p-channel_sidebar__badge'),t=0;
    for(var i=0;i<b.length;i++){var n=parseInt(b[i].innerText,10);t+=isNaN(n)?1:n;}
    return t;
  }catch(e){return 0}})()`,

  gmailCount: `(function(){try{
    var m=document.title.match(/Inbox(?:\\s+\\(([0-9]+)\\))?/);if(m&&m[1])return parseInt(m[1],10);
    var els=document.querySelectorAll('a[aria-label*="unread"],div[aria-label*="unread"]');
    for(var i=0;i<els.length;i++){var lbl=els[i].getAttribute('aria-label');var mm=lbl&&lbl.match(/([0-9]+)\\s+unread/);if(mm)return parseInt(mm[1],10);}
    return 0;
  }catch(e){return 0}})()`,

  genericCount: `(function(){try{
    var m=document.title.match(/\\(([0-9]+)\\)/);if(m)return parseInt(m[1],10);
    if(/^[*•!]/.test(document.title))return 1;
    var sel='[aria-label*="unread"],[data-testid="unread-count"],.unread-count,.notification-badge';
    var els=document.querySelectorAll(sel),t=0;
    for(var i=0;i<els.length;i++){if(els[i].offsetParent===null)continue;var n=parseInt(els[i].innerText,10);t+=isNaN(n)?1:n;}
    return t;
  }catch(e){return 0}})()`,
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ElectronWebviewTag extends HTMLElement {
  src: string;
  partition?: string;
  reload: () => void;
  addEventListener:    (name: string, cb: (...args: any[]) => void) => void;
  removeEventListener: (name: string, cb: (...args: any[]) => void) => void;
  executeJavaScript:   (code: string, userGesture?: boolean) => Promise<any>;
  setAudioMuted?:      (muted: boolean) => void;
}

interface AccountWebViewProps {
  providerId: number;
  accountId:  number;
  url:        string;
  visible?:   boolean;
  mainProcessPolling?: boolean; // if true, skip renderer-side polling (main already handles it)
  onUnreadChange?: (pid: number, aid: number, count: number, msg?: string | null) => void;
  muted?:     boolean;
}

// How often renderer polls when main-process polling is NOT active (ms)
const RENDERER_POLL_INTERVAL = 8000;

// ─── Component ────────────────────────────────────────────────────────────────
const AccountWebView = React.memo(function AccountWebView({
  providerId,
  accountId,
  url,
  visible = true,
  mainProcessPolling = false,
  onUnreadChange,
  muted = false,
}: AccountWebViewProps) {
  const webviewRef      = useRef<ElectronWebviewTag | null>(null);
  const partition       = `persist:pv_${providerId}_acc_${accountId}`;

  // Unique UA per Telegram account to avoid session collision detection
  const userAgent = providerId === 2
    ? (() => {
        const offset = accountId % 50;
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + Math.floor(offset / 10)}${offset % 10}.0.0.0 Safari/537.36`;
      })()
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // Use refs for values read inside async callbacks to avoid stale closures
  const visibleRef          = useRef(visible);
  const mutedRef            = useRef(muted);
  const mainPollingRef      = useRef(mainProcessPolling);
  const onUnreadChangeRef   = useRef(onUnreadChange);
  const lastCountRef        = useRef<number>(-1);
  const isDomReadyRef       = useRef(false);
  const preloadPathRef      = useRef<string>('');

  useEffect(() => { visibleRef.current         = visible;          }, [visible]);
  useEffect(() => { mutedRef.current           = muted;            }, [muted]);
  useEffect(() => { mainPollingRef.current     = mainProcessPolling; }, [mainProcessPolling]);
  useEffect(() => { onUnreadChangeRef.current  = onUnreadChange;   }, [onUnreadChange]);

  // ── Execute JS with timeout ──────────────────────────────────────────────
  const execSafe = async (wv: ElectronWebviewTag, code: string, timeoutMs = 800): Promise<any> => {
    if (typeof (wv as any).executeJavaScript !== 'function') return null;
    return Promise.race([
      (wv as any).executeJavaScript(code, true),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), timeoutMs)),
    ]).catch(() => null);
  };

  // ── Count detector ───────────────────────────────────────────────────────
  const getCount = async (wv: ElectronWebviewTag): Promise<{ count: number; message?: string | null }> => {
    switch (providerId) {
      case 1: { // WhatsApp
        const count = await execSafe(wv, JS.whatsappCount);
        const message = (count ?? 0) > 0 ? await execSafe(wv, JS.whatsappMsg, 1000) : null;
        return { count: typeof count === 'number' ? count : 0, message };
      }
      case 2: // Telegram
        return { count: (await execSafe(wv, JS.telegramCount)) ?? 0 };
      case 5: case 6: // Messenger / Facebook
        return { count: (await execSafe(wv, JS.messengerCount)) ?? 0 };
      case 8: // Discord
        return { count: (await execSafe(wv, JS.discordCount)) ?? 0 };
      case 28: // Slack
        return { count: (await execSafe(wv, JS.slackCount)) ?? 0 };
      case 16: // Gmail
        return { count: (await execSafe(wv, JS.gmailCount)) ?? 0 };
      default:
        return { count: (await execSafe(wv, JS.genericCount)) ?? 0 };
    }
  };

  // ── Audio mute sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !isDomReadyRef.current || typeof wv.setAudioMuted !== 'function') return;
    wv.setAudioMuted(!!muted);
  }, [muted]);

  // ── Visibility management ────────────────────────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    if (visible) {
      Object.assign(wv.style, {
        display: 'flex', width: '100%', height: '100%',
        position: 'relative', opacity: '1', pointerEvents: 'auto', zIndex: '1',
      });
    } else {
      // Keep in DOM (preserves session/state), but invisible and non-interactive
      Object.assign(wv.style, {
        display: 'flex', width: '100%', height: '100%',
        position: 'absolute', top: '0', left: '0',
        opacity: '0', pointerEvents: 'none', zIndex: '-1',
      });
    }
  }, [visible]);

  // ── Lifecycle — dom-ready, polling, cleanup ──────────────────────────────
  useEffect(() => {
    let isMounted     = true;
    let timeoutId: any;
    let listenersOn   = false;

    // Start preload path fetch (uses module-level cache)
    getPreloadPath().then(p => {
      if (isMounted) preloadPathRef.current = p;
    }).catch(() => {});

    const handleDomReady = async () => {
      if (!isMounted) return;
      isDomReadyRef.current = true;

      // Configure session (set UA, block native notifications)
      const api = (window as any).electronAPI;
      if (api?.configurePartition) {
        try { await api.configurePartition(partition, { userAgent }); } catch {}
      }

      const wv = webviewRef.current as any;
      if (wv?.setAudioMuted) wv.setAudioMuted(!!mutedRef.current);
    };

    const handleNewWindow = (e: any) => {
      if (e?.url && !e.url.includes('localhost')) {
        const api = (window as any).electronAPI;
        try { api?.openExternal?.(e.url); } catch {}
      }
    };

    const attachListeners = (node: ElectronWebviewTag | null) => {
      if (!node || listenersOn) return;
      try {
        node.addEventListener('dom-ready',   handleDomReady);
        node.addEventListener('new-window',  handleNewWindow);
        listenersOn = true;
      } catch {}
    };

    const poll = async () => {
      if (!isMounted) return;
      attachListeners(webviewRef.current);

      // Skip polling if main process already handles this provider
      if (mainPollingRef.current) {
        timeoutId = setTimeout(poll, RENDERER_POLL_INTERVAL * 3); // check much less often
        return;
      }

      const wv = webviewRef.current;
      if (!wv || !isDomReadyRef.current) {
        timeoutId = setTimeout(poll, RENDERER_POLL_INTERVAL);
        return;
      }

      try {
        const { count, message } = await getCount(wv);
        const clamped = Math.max(0, typeof count === 'number' ? count : 0);

        if (clamped !== lastCountRef.current) {
          lastCountRef.current = clamped;
          onUnreadChangeRef.current?.(providerId, accountId, clamped, message ?? null);
        }
      } catch { /* ignore */ }

      if (isMounted) timeoutId = setTimeout(poll, RENDERER_POLL_INTERVAL);
    };

    // Small initial delay so webview can start loading
    timeoutId = setTimeout(poll, 1500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      isDomReadyRef.current = false;
      const wv = webviewRef.current;
      if (wv && listenersOn) {
        try { (wv as any).removeEventListener('dom-ready',  handleDomReady);  } catch {}
        try { (wv as any).removeEventListener('new-window', handleNewWindow); } catch {}
      }
    };
  }, [providerId, accountId, partition]); // eslint-disable-line

  // ── Render ───────────────────────────────────────────────────────────────
  if (!url || url === 'about:blank') return null;

  return React.createElement('webview', {
    ref:        webviewRef,
    src:        url,
    partition:  partition,
    useragent:  userAgent,
    allowpopups: 'true',
    style: {
      display:       'flex',
      width:         '100%',
      height:        '100%',
      border:        'none',
      position:      visible ? 'relative' : 'absolute',
      top:           0,
      left:          0,
      opacity:       visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      zIndex:        visible ? 1 : -1,
    },
  } as any);
});

export default AccountWebView;
