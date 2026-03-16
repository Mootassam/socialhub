import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AccountWebView from './components/AccountWebView';
import UpdateNotification from './components/UpdateNotification';
import { ALL_PROVIDERS, getProviderUrl, isBackgroundPollEnabled } from './data/providers';
import '@fortawesome/fontawesome-free/css/all.min.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Provider {
  id: number;
  name: string;
  icon: string;
  color: string;
  notifications: number;
  muted?: boolean;
}

interface Account {
  id: number;
  name: string;
  notifications: number;
  color: string;
  muted?: boolean;
  lastMessage?: string | null;
}

type AccountMap = Record<number, Account[]>;

// ─── Constants (outside component — never recreated) ──────────────────────────
const WARM_LIMIT = 4; // how many inactive webviews to keep alive (LRU)

// Unique user-agent for Telegram multi-account (avoids session collision detection)
function getTelegramUserAgent(accountId: number): string {
  const offset = accountId % 50;
  const major  = 120 + Math.floor(offset / 10);
  const minor  = offset % 10;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}${minor}.0.0.0 Safari/537.36`;
}

// ─── AccountManager ────────────────────────────────────────────────────────────
const AccountManager: React.FC = () => {
  const api = (window as any).electronAPI as Record<string, any> | undefined;

  // ── State ──────────────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts]   = useState<AccountMap>({});
  const [activeProviderId, setActiveProviderId] = useState<number>(1);
  const [activeAccountId,  setActiveAccountId]  = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal visibility
  const [showSettingsModal,    setShowSettingsModal]    = useState(false);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [showSupportModal,     setShowSupportModal]     = useState(false);

  // Context menu
  const [showContextMenu,      setShowContextMenu]      = useState(false);
  const [contextMenuPos,       setContextMenuPos]       = useState({ x: 0, y: 0 });
  const [contextProviderId,    setContextProviderId]    = useState<number | null>(null);
  const [contextAccountId,     setContextAccountId]     = useState<number | null>(null);

  // Edit modal
  const [editAccountName,  setEditAccountName]  = useState('');
  const [editProviderId,   setEditProviderId]   = useState<number | null>(null);
  const [editAccountId,    setEditAccountId]    = useState<number | null>(null);

  // Provider search
  const [providerSearch, setProviderSearch] = useState('');

  // Drag-and-drop
  const [draggedProviderId, setDraggedProviderId] = useState<number | null>(null);

  // LRU warm webview cache
  const [loadedAccountKeys, setLoadedAccountKeys] = useState<string[]>([]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  // Keep latest providers accessible inside async/event callbacks without stale closures
  const providersRef = useRef<Provider[]>([]);
  providersRef.current = providers;

  const accountsRef = useRef<AccountMap>({});
  accountsRef.current = accounts;

  // Track which backgrounds are running to avoid duplicates
  const runningBgSet = useRef(new Set<string>());

  // ── Persistence — Load on mount ────────────────────────────────────────────
  useEffect(() => {
    const initApp = async () => {
      try {
        const appState = api?.loadAppState ? await api.loadAppState() : null;

        if (appState && appState.providers) {
          setProviders(appState.providers.map((p: Provider) => ({ ...p, muted: p.muted ?? false })));
        } else {
          // Default: WhatsApp with one account
          setProviders([{ id: 1, name: 'WhatsApp', icon: './provider/whatsapp.png', color: '#25d366', notifications: 0, muted: false }]);
        }

        if (appState && appState.accounts) {
          const withDefaults: AccountMap = {};
          Object.keys(appState.accounts).forEach(key => {
            const pid = Number(key);
            withDefaults[pid] = (appState.accounts[key] || []).map((a: Account) => ({ ...a, muted: a.muted ?? false }));
          });
          setAccounts(withDefaults);
        } else {
          setAccounts({ 1: [{ id: 101, name: 'Account 1', notifications: 0, color: '#25d366', muted: false }] });
          setActiveProviderId(1);
          setActiveAccountId(101);
        }
      } catch { /* ignore corrupt storage */ }

      setIsLoading(false);
    };

    initApp();
  }, []);

  // Set sensible default active IDs once providers/accounts are loaded
  useEffect(() => {
    if (providers.length > 0 && activeAccountId === 0) {
      const pid  = providers[0].id;
      const accs = accounts[pid];
      if (accs && accs.length > 0) {
        setActiveProviderId(pid);
        setActiveAccountId(accs[0].id);
      }
    }
  }, [providers, accounts]); // eslint-disable-line

  // ── Persistence — Save on change (debounced) ───────────────────────────────
  useEffect(() => {
    // Only save when we actually have state loaded
    if (providers.length === 0 && Object.keys(accounts).length === 0) return;
    try {
      if (api?.saveAppState) {
        // Fire to disk immediately to prevent data loss on close
        api.saveAppState({ providers, accounts });
      } else {
        localStorage.setItem('providers', JSON.stringify(providers));
        localStorage.setItem('accounts',  JSON.stringify(accounts));
      }
    } catch {}
  }, [providers, accounts]);

  // ── Sync provider notification counts from accounts (debounced) ────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setProviders(prev => prev.map(p => {
        const accs  = accountsRef.current[p.id] || [];
        const total = accs.reduce((sum, a) => sum + a.notifications, 0);
        // Avoid object churn if nothing changed
        return p.notifications === total ? p : { ...p, notifications: total };
      }));
    }, 200);
    return () => clearTimeout(t);
  }, [accounts]);

  // ── IPC: message-detected (main-process background polling) ───────────────
  useEffect(() => {
    if (!api?.onMessageDetected) return;

    const handleMessageDetected = (data: {
      providerId: number; accountId: number; count: number; message?: string | null;
    }) => {
      if (!data) return;
      const { providerId, accountId, count, message } = data;

      setAccounts(prev => {
        const accs = prev[providerId];
        if (!accs) return prev;
        const acc = accs.find(a => a.id === accountId);
        if (!acc) return prev;

        // Read mute state from the latest ref to avoid stale closure
        const providerMuted = providersRef.current.find(p => p.id === providerId)?.muted ?? false;
        if (providerMuted || acc.muted) return prev;

        if (count <= acc.notifications && message === acc.lastMessage) return prev; // no change

        return {
          ...prev,
          [providerId]: accs.map(a =>
            a.id === accountId
              ? { ...a, notifications: Math.max(a.notifications, count), lastMessage: message ?? a.lastMessage }
              : a
          ),
        };
      });
    };

    api.onMessageDetected(handleMessageDetected);

    // Cleanup: remove listener when component unmounts
    return () => { try { api.offMessageDetected?.(); } catch {} };
  }, []); // eslint-disable-line — intentionally runs once; uses refs for fresh data

  // ── Report active context to main (for notification suppression) ──────────
  useEffect(() => {
    let focusStatus = true;
    const sendContext = () => {
      if (api?.setActiveContext && activeProviderId && activeAccountId) {
        // Send 0,0 if not focused, otherwise send actual IDs to suppress notifications
        try {
          if (focusStatus) {
            api.setActiveContext(activeProviderId, activeAccountId);
          } else {
            api.setActiveContext(0, 0);
          }
        } catch {}
      }
    };

    const handleFocus = (data: { focused: boolean }) => {
      focusStatus = data?.focused ?? true;
      sendContext();
    };

    if (api?.onWindowFocusChanged) {
      api.onWindowFocusChanged(handleFocus);
    }
    
    // Initial send
    sendContext();

    return () => {
      try { api?.offWindowFocusChanged?.(); } catch {}
    };
  }, [activeProviderId, activeAccountId]);

  // ── LRU warm cache of webview keys ────────────────────────────────────────
  useEffect(() => {
    if (!activeProviderId || !activeAccountId) return;
    const key = `${activeProviderId}-${activeAccountId}`;
    setLoadedAccountKeys(prev => {
      const next = [key, ...prev.filter(k => k !== key)];
      return next.slice(0, WARM_LIMIT);
    });
  }, [activeProviderId, activeAccountId]);

  // ── Start/stop main-process background polling ─────────────────────────────
  useEffect(() => {
    if (!api?.startBackground) return;

    const started: Array<{ pid: number; aid: number }> = [];

    Object.keys(accounts).forEach(k => {
      const pid = Number(k);
      if (!isBackgroundPollEnabled(pid)) return;
      (accounts[pid] || []).forEach(acc => {
        const bgKey = `${pid}-${acc.id}`;
        if (runningBgSet.current.has(bgKey)) return; // already running

        const partition = `persist:pv_${pid}_acc_${acc.id}`;
        const url       = getProviderUrl(pid);
        const userAgent = pid === 2 ? getTelegramUserAgent(acc.id) : '';

        try {
          api.startBackground(pid, acc.id, url, partition, userAgent);
          runningBgSet.current.add(bgKey);
          started.push({ pid, aid: acc.id });
        } catch {}
      });
    });

    // Note: we do NOT stop backgrounds when accounts change (accounts only ever grow,
    // and stopping/restarting would cause sessions to drop). Cleanup happens in stop-on-delete.
  }, [accounts]); // eslint-disable-line

  // ── Context menu: close on Escape / outside click ─────────────────────────
  useEffect(() => {
    if (!showContextMenu) return;
    const close = () => setShowContextMenu(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click',   close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click',   close);
    };
  }, [showContextMenu]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const currentProvider = useMemo(() =>
    providers.find(p => p.id === activeProviderId), [providers, activeProviderId]);

  const currentAccount = useMemo(() =>
    accounts[activeProviderId]?.find(a => a.id === activeAccountId),
    [accounts, activeProviderId, activeAccountId]);

  const filteredAllProviders = useMemo(() =>
    ALL_PROVIDERS.filter(p => {
      const matches = p.name.toLowerCase().includes(providerSearch.toLowerCase());
      const added   = providers.some(x => x.id === p.id);
      return matches && !added;
    }),
    [providers, providerSearch]);

  // Stable sorted providers for webview pool (prevents pool re-sort on provider re-order)
  const stableProviders = useMemo(() =>
    [...providers].sort((a, b) => a.id - b.id), [providers]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleProviderClick = useCallback((providerId: number) => {
    setActiveProviderId(providerId);
    const accs = accountsRef.current[providerId];
    if (accs && accs.length > 0) setActiveAccountId(accs[0].id);
  }, []);

  const handleAccountClick = useCallback((accountId: number) => {
    setActiveAccountId(accountId);
    // Clear badge when user views the account
    setAccounts(prev => {
      const pid  = activeProviderId;
      const accs = prev[pid];
      if (!accs) return prev;
      const acc = accs.find(a => a.id === accountId);
      if (!acc || acc.notifications === 0) return prev;
      return { ...prev, [pid]: accs.map(a => a.id === accountId ? { ...a, notifications: 0 } : a) };
    });
  }, [activeProviderId]);


  const setUnreadCount = useCallback((
    providerId: number, accountId: number, count: number, message?: string | null
  ) => {
    setAccounts(prev => {
      const accs = prev[providerId];
      if (!accs) return prev;
      return {
        ...prev,
        [providerId]: accs.map(a => {
          if (a.id !== accountId) return a;
          const provMuted = providersRef.current.find(p => p.id === providerId)?.muted ?? false;
          const effective = (provMuted || a.muted) ? 0 : count;
          if (a.notifications === effective && a.lastMessage === (message ?? a.lastMessage)) return a;
          return { ...a, notifications: effective, lastMessage: message ?? a.lastMessage ?? null };
        }),
      };
    });
  }, []);

  const toggleProviderMute = useCallback((providerId: number) => {
    setProviders(prev => prev.map(p => {
      if (p.id !== providerId) return p;
      const nextMuted = !p.muted;
      if (nextMuted) {
        // Clear badges when muting
        setAccounts(a => ({
          ...a,
          [providerId]: (a[providerId] || []).map(acc => ({ ...acc, notifications: 0 })),
        }));
      }
      return { ...p, muted: nextMuted };
    }));
  }, []);

  const toggleAccountMute = useCallback((providerId: number, accountId: number) => {
    setAccounts(prev => {
      const accs = prev[providerId];
      if (!accs) return prev;
      return {
        ...prev,
        [providerId]: accs.map(a =>
          a.id === accountId
            ? { ...a, muted: !a.muted, notifications: !a.muted ? 0 : a.notifications }
            : a
        ),
      };
    });
  }, []);

  const handleAddAccount = useCallback(() => {
    if (!currentProvider) return;
    const pid      = activeProviderId;
    const existing = accountsRef.current[pid] || [];
    const nextId   = existing.length > 0
      ? existing[existing.length - 1].id + 1
      : pid * 100 + 1;

    const newAcc: Account = {
      id: nextId,
      name: `Account ${existing.length + 1}`,
      notifications: 0,
      color: currentProvider.color,
      muted: false,
    };
    setAccounts(prev => ({ ...prev, [pid]: [...(prev[pid] || []), newAcc] }));
    setActiveAccountId(newAcc.id);
  }, [activeProviderId, currentProvider]);

  const handleAddProvider = useCallback((provider: typeof ALL_PROVIDERS[number]) => {
    if (providers.some(p => p.id === provider.id)) return; // already added (guard)
    const newProvider: Provider = { ...provider, notifications: 0, muted: false };
    setProviders(prev => [...prev, newProvider]);
    const defaultAcc: Account = {
      id: provider.id * 100 + 1,
      name: 'Account 1',
      notifications: 0,
      color: provider.color,
      muted: false,
    };
    setAccounts(prev => ({ ...prev, [provider.id]: [defaultAcc] }));
    setActiveProviderId(provider.id);
    setActiveAccountId(defaultAcc.id);
    setShowAddProviderModal(false);
    setProviderSearch('');
  }, [providers]);

  const handleRemoveProvider = useCallback((providerId: number) => {
    setProviders(prev => {
      if (prev.length <= 1) {
        alert('You must have at least one provider connected.');
        return prev;
      }
      const prov = prev.find(p => p.id === providerId);
      if (!prov || !confirm(`Remove ${prov.name}?`)) return prev;
      const remaining = prev.filter(p => p.id !== providerId);
      if (activeProviderId === providerId && remaining.length > 0) {
        const np = remaining[0];
        setActiveProviderId(np.id);
        const accs = accountsRef.current[np.id];
        if (accs && accs.length > 0) setActiveAccountId(accs[0].id);
      }
      return remaining;
    });
    setShowSettingsModal(false);
  }, [activeProviderId]);

  const deleteAccount = useCallback((providerId: number, accountId: number) => {
    if (!confirm('Delete this account?')) return;

    // Stop background polling for this account
    try { api?.stopBackground?.(providerId, accountId); } catch {}
    runningBgSet.current.delete(`${providerId}-${accountId}`);

    setAccounts(prev => {
      const remaining = (prev[providerId] || []).filter(a => a.id !== accountId);
      if (activeProviderId === providerId && activeAccountId === accountId) {
        setActiveAccountId(remaining.length > 0 ? remaining[0].id : 0);
      }
      return { ...prev, [providerId]: remaining };
    });
  }, [activeProviderId, activeAccountId]);

  const openEditAccount = useCallback((providerId: number, accountId: number) => {
    const acc = accountsRef.current[providerId]?.find(a => a.id === accountId);
    if (!acc) return;
    setEditProviderId(providerId);
    setEditAccountId(accountId);
    setEditAccountName(acc.name);
    setShowEditAccountModal(true);
  }, []);

  const saveEditAccount = useCallback(() => {
    if (editProviderId == null || editAccountId == null) return;
    const name = editAccountName.trim();
    if (!name) { alert('Please enter a valid name.'); return; }
    setAccounts(prev => ({
      ...prev,
      [editProviderId]: (prev[editProviderId] || []).map(a =>
        a.id === editAccountId ? { ...a, name } : a
      ),
    }));
    setShowEditAccountModal(false);
  }, [editProviderId, editAccountId, editAccountName]);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 400);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleOpenInBrowser = useCallback(() => {
    const url = getProviderUrl(activeProviderId);
    if (url && url !== 'about:blank') {
      window.open(url, '_blank');
    }
  }, [activeProviderId]);

  const handleResetApp = useCallback(async () => {
    if (!confirm('Factory Reset: delete all accounts, sessions, and settings?')) return;
    localStorage.clear();
    try {
      if (api?.saveAppState) await api.saveAppState(null);
      await api?.clearAllData?.();
    } catch {}
    window.location.reload();
  }, []);

  // ── Drag and Drop ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, providerId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(providerId));
    requestAnimationFrame(() => setDraggedProviderId(providerId));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    e.stopPropagation();
    let sourceId = draggedProviderId ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!sourceId || sourceId === targetId) { setDraggedProviderId(null); return; }

    setProviders(prev => {
      const src = prev.findIndex(p => p.id === sourceId);
      const tgt = prev.findIndex(p => p.id === targetId);
      if (src === -1 || tgt === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(src, 1);
      next.splice(tgt, 0, item);
      return next;
    });
    setDraggedProviderId(null);
  }, [draggedProviderId]);

  const handleDragEnd = useCallback(() => setDraggedProviderId(null), []);

  // ── Webview Pool ───────────────────────────────────────────────────────────
  const renderWebviewPool = () => (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {stableProviders.map(p =>
        (accounts[p.id] || []).map(a => {
          const k        = `${p.id}-${a.id}`;
          const visible  = p.id === activeProviderId && a.id === activeAccountId;
          const shouldLoad = visible || loadedAccountKeys.includes(k);
          const url      = shouldLoad ? getProviderUrl(p.id) : 'about:blank';
          const isMuted  = !!p.muted || !!a.muted;
          // If main process is polling this provider, renderer skips its own polling
          const mainPolling = isBackgroundPollEnabled(p.id);

          return (
            <AccountWebView
              key={`pool-${p.id}-${a.id}`}
              providerId={p.id}
              accountId={a.id}
              url={url}
              visible={visible}
              mainProcessPolling={mainPolling}
              onUnreadChange={setUnreadCount}
              muted={isMuted}
            />
          );
        })
      )}
      {isLoading && (
        <div className="loading-container" style={{ position: 'absolute', inset: 0 }}>
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="account-manager">
      {/* Left Sidebar */}
      <div className="sidebar">
        <div className="logo-area" onClick={() => setShowSupportModal(true)} style={{ cursor: 'pointer' }}>
          <div className="logo">
            <i className="fa-solid fa-th"></i>
          </div>
        </div>

        <div className="providers-section">
          {providers.map(provider => (
            <div
              key={provider.id}
              className="provider-icon-wrapper"
              draggable
              onDragStart={(e) => handleDragStart(e, provider.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, provider.id)}
              onDragEnd={handleDragEnd}
              style={{ opacity: draggedProviderId === provider.id ? 0.4 : 1, cursor: 'grab' }}
            >
              <div
                className={`provider-icon ${activeProviderId === provider.id ? 'active' : ''}`}
                title={provider.name}
                onClick={() => handleProviderClick(provider.id)}
              >
                <img src={provider.icon} style={{ width: '100%' }} draggable={false} alt={provider.name} />
                {provider.muted && (
                  <div className="provider-mute-indicator">
                    <i className="fa-solid fa-bell-slash"></i>
                  </div>
                )}
                {provider.notifications > 0 && (
                  <div className="provider-notification">
                    {provider.notifications > 99 ? '99+' : provider.notifications}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-icon" title="Add Provider" onClick={() => setShowAddProviderModal(true)}>
            <i className="fa-solid fa-plus"></i>
          </div>
          <div className="sidebar-icon" title="Settings" onClick={() => setShowSettingsModal(true)}>
            <i className="fa-solid fa-gear"></i>
          </div>
          <div className="sidebar-icon" title="Factory Reset" onClick={handleResetApp} style={{ color: '#ef4444' }}>
            <i className="fa-solid fa-trash"></i>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Accounts Top Bar */}
        <div className="top-bar">
          <div className="accounts-scroll">
            {(accounts[activeProviderId] || []).map(account => (
              <div
                key={account.id}
                className={`account-card ${activeAccountId === account.id ? 'active' : ''}`}
                onClick={() => handleAccountClick(account.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuPos({ x: e.clientX, y: e.clientY });
                  setContextProviderId(activeProviderId);
                  setContextAccountId(account.id);
                  setEditAccountName(account.name);
                  setShowContextMenu(true);
                }}
              >
                <div className="account-icon">
                  <img
                    src={currentProvider?.icon}
                    style={{ width: '100%' }}
                    decoding="async"
                    loading="lazy"
                    draggable={false}
                    alt=""
                  />
                  {account.muted && (
                    <div className="account-mute-indicator">
                      <i className="fa-solid fa-bell-slash"></i>
                    </div>
                  )}
                  {account.notifications > 0 && (
                    <div className="account-notification">
                      {account.notifications > 99 ? '99+' : account.notifications}
                    </div>
                  )}
                </div>
                <div className="account-name">{account.name}</div>
              </div>
            ))}
            <div className="add-account-btn" onClick={handleAddAccount} title="Add Account">
              <i className="fa-solid fa-plus"></i>
            </div>
          </div>
        </div>

        {/* Webview Area */}
        <div className="webview-area">
          <div className="webview-header">
            <div className="webview-title">
              <div className="webview-title-icon">
                <img
                  src={currentProvider?.icon}
                  style={{ width: '100%' }}
                  decoding="async"
                  loading="lazy"
                  draggable={false}
                  alt=""
                />
              </div>
              <span>
                {currentProvider
                  ? `${currentProvider.name}${currentAccount ? ` • ${currentAccount.name}` : ''}`
                  : 'Select a Provider'}
              </span>
            </div>
            <div className="webview-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 10 }}>
              <div className="window-controls" style={{ display: 'flex', gap: 8 }}>
                <i className="fa-solid fa-expand"            onClick={handleFullscreen}    title="Fullscreen"       style={{ cursor: 'pointer', padding: 5 }}></i>
                <i className="fa-solid fa-external-link-alt" onClick={handleOpenInBrowser} title="Open in Browser"  style={{ cursor: 'pointer', padding: 5 }}></i>
                <i className="fa-solid fa-sync-alt"          onClick={handleRefresh}       title="Refresh"          style={{ cursor: 'pointer', padding: 5 }}></i>
              </div>
            </div>
          </div>

          <div className="webview-container">
            {renderWebviewPool()}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Settings Modal */}
      <div className={`modal ${showSettingsModal ? 'active' : ''}`} onClick={() => setShowSettingsModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Connected Providers</div>
            <div className="modal-close" onClick={() => setShowSettingsModal(false)}>
              <i className="fa-solid fa-times"></i>
            </div>
          </div>
          <div className="modal-body">
            <div className="settings-provider-list">
              {providers.map(provider => (
                <div key={provider.id} className="settings-provider-item">
                  <div className="settings-provider-icon">
                    <img src={provider.icon} style={{ width: '100%' }} draggable={false} alt={provider.name} />
                  </div>
                  <div className="settings-provider-info">
                    <div className="settings-provider-name">{provider.name}</div>
                    <div className="settings-provider-status">
                      <span>•</span>
                      <span>{provider.notifications} unread</span>
                    </div>
                  </div>
                  <div className="settings-provider-actions">
                    <div
                      className="action-btn edit"
                      title={provider.muted ? 'Unmute Provider' : 'Mute Provider'}
                      onClick={() => toggleProviderMute(provider.id)}
                    >
                      <i className={provider.muted ? 'fas fa-bell' : 'fas fa-bell-slash'}></i>
                    </div>
                    <div
                      className="action-btn remove"
                      title="Remove Provider"
                      onClick={() => handleRemoveProvider(provider.id)}
                    >
                      <i className="fas fa-trash"></i>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setShowSettingsModal(false)}>Close</button>
          </div>
        </div>
      </div>

      {/* Edit Account Modal */}
      <div className={`modal ${showEditAccountModal ? 'active' : ''}`} onClick={() => setShowEditAccountModal(false)}>
        <div className="modal-content simple-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Edit Account Name</div>
            <div className="modal-close" onClick={() => setShowEditAccountModal(false)}>
              <i className="fas fa-times"></i>
            </div>
          </div>
          <div className="modal-body">
            <div className="input-group">
              <input
                type="text"
                className="modal-input"
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEditAccount(); }}
                placeholder="Enter account name"
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setShowEditAccountModal(false)}>Cancel</button>
            <button className="btn-save"   onClick={saveEditAccount}>Save Changes</button>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setShowContextMenu(false)}></div>
          <div
            className="context-menu"
            style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }}
          >
            <div className="context-menu-item" onClick={() => {
              if (contextProviderId && contextAccountId) openEditAccount(contextProviderId, contextAccountId);
              setShowContextMenu(false);
            }}>
              <i className="fas fa-edit"></i> Edit Name
            </div>
            <div className="context-menu-item" onClick={() => {
              if (contextProviderId && contextAccountId) toggleAccountMute(contextProviderId, contextAccountId);
              setShowContextMenu(false);
            }}>
              <i className="fas fa-bell-slash"></i>{' '}
              {accounts[contextProviderId ?? 0]?.find(a => a.id === contextAccountId)?.muted ? 'Unmute Account' : 'Mute Account'}
            </div>
            <div className="context-menu-item" onClick={() => {
              if (contextProviderId) toggleProviderMute(contextProviderId);
              setShowContextMenu(false);
            }}>
              <i className="fas fa-bell"></i>{' '}
              {providers.find(p => p.id === contextProviderId)?.muted ? 'Unmute Provider' : 'Mute Provider'}
            </div>
            <div className="context-menu-divider"></div>
            <div className="context-menu-item delete" onClick={() => {
              if (contextProviderId && contextAccountId) deleteAccount(contextProviderId, contextAccountId);
              setShowContextMenu(false);
            }}>
              <i className="fas fa-trash"></i> Delete Account
            </div>
          </div>
        </>
      )}

      {/* Add Provider Modal */}
      <div className={`modal ${showAddProviderModal ? 'active' : ''}`} onClick={() => setShowAddProviderModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Add Provider</div>
            <div className="modal-close" onClick={() => setShowAddProviderModal(false)}>
              <i className="fas fa-times"></i>
            </div>
          </div>
          <div className="modal-body">
            <div className="input-group">
              <input
                type="text"
                className="modal-input"
                placeholder="Search services..."
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="providers-grid">
              {filteredAllProviders.map(provider => (
                <div key={provider.id} className="provider-grid-item" onClick={() => handleAddProvider(provider)}>
                  <div className="provider-grid-icon">
                    <img src={provider.icon} style={{ width: '100%' }} decoding="async" loading="lazy" draggable={false} alt={provider.name} />
                  </div>
                  <div className="provider-grid-name">{provider.name}</div>
                </div>
              ))}
              {filteredAllProviders.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#666' }}>
                  No providers found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Support / About Modal */}
      {showSupportModal && (
        <div className="modal active" onClick={() => setShowSupportModal(false)}>
          <div className="modal-content simple-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">About SocialHub</div>
              <div className="modal-close" onClick={() => setShowSupportModal(false)}>
                <i className="fas fa-times"></i>
              </div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 15 }}>
                <img src="./icons/icon.png" style={{ width: 64, height: 64 }} alt="SocialHub" />
              </div>
              <h3>SocialHub Messenger</h3>
              <p>Version 1.0.1</p>
              <p style={{ marginTop: 10, color: '#666' }}>All-in-one messenger for your desktop.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowSupportModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Update notification (auto-updater) */}
      <UpdateNotification />
    </div>
  );
};

export default AccountManager;
