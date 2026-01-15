import React, { useState, useEffect, useMemo, useRef } from 'react';
import AccountWebView from './components/AccountWebView';
import '@fortawesome/fontawesome-free/css/all.min.css';

interface Provider {
  id: number;
  name: string;
  icon: string;
  color: string;
  notifications: number;
}

interface Account {
  id: number;
  name: string;
  notifications: number;
  color: string;
}

const AccountManager: React.FC = () => {
  // Initial data
  const allProviders: Array<Pick<Provider, 'id' | 'name' | 'icon' | 'color'>> = [
    { id: 1, name: 'WhatsApp', icon: './provider/whatsapp.png', color: '#25d366' },
    { id: 2, name: 'Telegram', icon: './provider/telegram.png', color: '#0088cc' },
    { id: 3, name: 'Line', icon: './provider/line.png', color: '#00b900' },
    { id: 4, name: 'Instagram', icon: './provider/instagram.png', color: '#e4405f' },
    { id: 5, name: 'Messenger', icon: './provider/facebook-messenger.png', color: '#00B2FF' },
    { id: 6, name: 'Facebook', icon: './provider/facebook.png', color: '#1877f2' },
    { id: 8, name: 'Discord', icon: './provider/discord.png', color: '#5865f2' },
    { id: 10, name: 'TikTok', icon: './provider/tiktok.png', color: '#000000' },
    { id: 12, name: 'Teams', icon: './provider/business.png', color: '#6264a7' },
    { id: 13, name: 'Tinder', icon: './provider/tinder.png', color: '#e24670' },
    { id: 14, name: 'Snapchat', icon: './provider/snapchat.png', color: '#fffc00' },
    { id: 15, name: 'LinkedIn', icon: './provider/linkedin.png', color: '#0a66c2' },
    { id: 16, name: 'Gmail', icon: './provider/gmail.png', color: '#ea4335' },
    { id: 17, name: 'VK', icon: './provider/vk.png', color: '#4c75a3' },
    { id: 19, name: 'DeepSeek', icon: './provider/deepseek.svg', color: '#5d5fef' },
    { id: 20, name: 'ChatGPT', icon: './provider/chatgpt.png', color: '#10a37f' },
    { id: 21, name: 'Google Sheets', icon: './provider/google-sheets.png', color: '#0b57d0' },
    { id: 22, name: 'Google Voice', icon: './provider/Google_Voice.png', color: '#0b57d0' },
    { id: 23, name: 'X (Twitter)', icon: './provider/twitter.png', color: '#000000' },
    { id: 24, name: 'Zalo', icon: './provider/zalo.png', color: '#0068ff' },
    { id: 25, name: 'Hangouts', icon: './provider/hangouts.png', color: '#0f9d58' },
    { id: 26, name: 'TextNow', icon: './provider/textnow.png', color: '#8839fb' },
    { id: 27, name: 'Text Free', icon: './provider/textfree.png', color: '#6633cc' },
  ];

  const providerUrls: Record<number, string> = {
    1: "https://web.whatsapp.com",
    2: "https://web.telegram.org",
    3: "https://line.me",
    4: "https://instagram.com",
    5: "https://www.messenger.com/login",
    8: "https://discord.com/login",
    6: "https://www.facebook.com/login",
    10: "https://www.tiktok.com/login",
    12: "https://teams.microsoft.com/",
    13: "https://tinder.com/app/login",
    14: "https://www.snapchat.com/",
    15: "https://www.linkedin.com/login",
    16: "https://mail.google.com/",
    17: "https://vk.com",
    19: "https://chat.deepseek.com",
    20: "https://chatgpt.com/",
    21: "https://docs.google.com/spreadsheets/",
    22: "https://voice.google.com/",
    23: "https://twitter.com/login",
    24: "https://chat.zalo.me/",
    25: "https://hangouts.google.com/",
    26: "https://www.textnow.com/login",
    27: "https://messages.textfree.us/login",
    28: "https://app.slack.com/client",
  };

  // State
  const [providers, setProviders] = useState<Provider[]>([
    { id: 1, name: "WhatsApp", icon: "./provider/whatsapp.png", color: "#25d366", notifications: 0 },
  ]);

  const [accounts, setAccounts] = useState<Record<number, Account[]>>({
    1: [
      { id: 101, name: "Account 1", notifications: 0, color: "#25d366" },
      { id: 102, name: "Account 2", notifications: 0, color: "#25d366" },
      { id: 103, name: "Account 3", notifications: 0, color: "#25d366" },
      { id: 104, name: "Account 4", notifications: 0, color: "#25d366" },
      { id: 105, name: "Account 5", notifications: 0, color: "#25d366" },
      { id: 106, name: "Account 6", notifications: 0, color: "#25d366" }
    ],
    2: [{ id: 201, name: "Account 1", notifications: 0, color: "#0088cc" }],
    3: [{ id: 301, name: "Account 1", notifications: 0, color: "#00b900" }],
    4: [{ id: 401, name: "Account 1", notifications: 0, color: "#e4405f" }],
    8: [{ id: 801, name: "Account 1", notifications: 0, color: "#5865f2" }],
    17: [{ id: 1701, name: "Account 1", notifications: 0, color: "#4c75a3" }],
    19: [{ id: 1901, name: "Account 1", notifications: 0, color: "#5d5fef" }],
    20: [{ id: 2001, name: "Account 1", notifications: 0, color: "#10a37f" }],
    21: [{ id: 2101, name: "Account 1", notifications: 0, color: "#0b57d0" }],
  });

  const [activeProviderId, setActiveProviderId] = useState<number>(1);
  const [activeAccountId, setActiveAccountId] = useState<number>(101);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showAddProviderModal, setShowAddProviderModal] = useState<boolean>(false);
  const [providerSearch, setProviderSearch] = useState<string>('');
  const [showEditAccountModal, setShowEditAccountModal] = useState<boolean>(false);
  const [editAccountName, setEditAccountName] = useState<string>('');
  const [editProviderId, setEditProviderId] = useState<number | null>(null);
  const [editAccountId, setEditAccountId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // PERFORMANCE: Always enabled
  const backgroundUpdatesEnabled = true;

  const [loadedAccountKeys, setLoadedAccountKeys] = useState<string[]>([]);
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [contextAccountId, setContextAccountId] = useState<number | null>(null);
  const [contextProviderId, setContextProviderId] = useState<number | null>(null);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);

  // Drag and Drop State
  const [draggedProviderId, setDraggedProviderId] = useState<number | null>(null);

  const prevAccountsRef = useRef<Record<number, Account[]>>({});

  // Effects
  useEffect(() => {
    // Fast initial loading
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Load persisted providers/accounts on start
  useEffect(() => {
    try {
      const savedProviders = localStorage.getItem('providers');
      const savedAccounts = localStorage.getItem('accounts');
      if (savedProviders) {
        setProviders(JSON.parse(savedProviders));
      }
      if (savedAccounts) {
        setAccounts(JSON.parse(savedAccounts));
      }
    } catch { }
  }, []);

  // Persist providers/accounts whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('providers', JSON.stringify(providers));
    } catch { }
  }, [providers]);

  useEffect(() => {
    try {
      localStorage.setItem('accounts', JSON.stringify(accounts));
    } catch { }
  }, [accounts]);

  // Request notification permission
  useEffect(() => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Close context menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showContextMenu) {
        setShowContextMenu(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('click', () => setShowContextMenu(false));

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('click', () => setShowContextMenu(false));
    };
  }, [showContextMenu]);

  // Update provider notifications when accounts change
  useEffect(() => {
    setProviders(prev => prev.map(provider => {
      const providerAccounts = accounts[provider.id] || [];
      const totalNotifications = providerAccounts.reduce((sum, account) => sum + account.notifications, 0);
      return { ...provider, notifications: totalNotifications };
    }));
  }, [accounts]);

  useEffect(() => {
    const prev = prevAccountsRef.current;
    Object.keys(accounts).forEach(key => {
      const providerId = Number(key);
      const newAccounts = accounts[providerId] || [];
      const prevAccounts = prev[providerId] || [];
      const prevMap = new Map(prevAccounts.map(a => [a.id, a.notifications]));
      newAccounts.forEach(account => {
        const prevCount = prevMap.get(account.id) ?? 0;
        if (account.notifications > prevCount && account.notifications > 0) {
          const provider = providers.find(p => p.id === providerId);
          const title = provider ? `${provider.name} • ${account.name}` : account.name;
          const body =
            account.notifications === 1
              ? 'You have 1 unread message'
              : `You have ${account.notifications} unread messages`;
          const api = (window as any).electronAPI;
          if (api && typeof api.showNotification === 'function') {
            api.showNotification(title, body);
          }
        }
      });
    });
    prevAccountsRef.current = accounts;
  }, [accounts, providers]);

  // Mark active account as loaded so it stays warm for future switches
  useEffect(() => {
    const key = `${activeProviderId}-${activeAccountId}`;
    if (!activeProviderId || !activeAccountId) return;
    setLoadedAccountKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  }, [activeProviderId, activeAccountId]);

  // High Performance Mode: Preload ALL accounts to ensure instant switching
  useEffect(() => {
    if (backgroundUpdatesEnabled) {
      // Collect all account keys
      const allKeys: string[] = [];
      providers.forEach(p => {
        const pAccounts = accounts[p.id] || [];
        pAccounts.forEach(a => {
           allKeys.push(`${p.id}-${a.id}`);
        });
      });
      
      setLoadedAccountKeys(prev => {
        const uniqueKeys = new Set([...prev, ...allKeys]);
        if (uniqueKeys.size === prev.length) return prev;
        return Array.from(uniqueKeys);
      });
    }
  }, [providers, accounts, backgroundUpdatesEnabled]);

  // Filter providers not yet added and matching search
  const filteredProviders = allProviders.filter(p => {
    const matches = p.name.toLowerCase().includes(providerSearch.toLowerCase());
    const exists = providers.some(x => x.id === p.id);
    return matches && !exists;
  });

  // Current provider and account
  const currentProvider = providers.find(p => p.id === activeProviderId);
  const currentAccount = accounts[activeProviderId]?.find(a => a.id === activeAccountId);

  // Handlers
  const handleProviderClick = (providerId: number) => {
    setActiveProviderId(providerId);
    const providerAccounts = accounts[providerId];
    if (providerAccounts && providerAccounts.length > 0) {
      setActiveAccountId(providerAccounts[0].id);
    }
  };

  const handleAccountClick = (accountId: number) => {
    setActiveAccountId(accountId);
    // Clear notifications when user clicks on the account
    clearAccountNotifications(activeProviderId, accountId);
  };

  const handleAccountContextMenu = (e: React.MouseEvent, providerId: number, accountId: number, accountName: string) => {
    e.preventDefault();

    const x = e.clientX;
    const y = e.clientY;

    setContextMenuPosition({ x, y });
    setContextProviderId(providerId);
    setContextAccountId(accountId);
    setEditAccountName(accountName);
    setShowContextMenu(true);
  };

  const openEditAccount = (providerId: number, accountId: number) => {
    const acct = accounts[providerId]?.find(a => a.id === accountId);
    if (!acct) return;
    setEditProviderId(providerId);
    setEditAccountId(accountId);
    setEditAccountName(acct.name);
    setShowEditAccountModal(true);
  };

  const saveEditAccount = () => {
    if (editProviderId == null || editAccountId == null) return;
    const name = editAccountName.trim();
    if (!name) {
      alert('Please enter a valid account name.');
      return;
    }
    setAccounts(prev => ({
      ...prev,
      [editProviderId]: (prev[editProviderId] || []).map(a => a.id === editAccountId ? { ...a, name } : a)
    }));
    setShowEditAccountModal(false);
  };

  const deleteAccountDirect = (providerId: number, accountId: number) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      setAccounts(prev => {
        const remaining = (prev[providerId] || []).filter(a => a.id !== accountId);
        const next = { ...prev, [providerId]: remaining };

        if (activeProviderId === providerId && activeAccountId === accountId) {
          if (remaining.length > 0) {
            setActiveAccountId(remaining[0].id);
          } else {
            setActiveAccountId(0);
          }
        }

        return next;
      });
    }
  };



  // Update unread count directly (from title-based detection)
  const setUnreadCount = (providerId: number, accountId: number, count: number) => {
    setAccounts(prev => ({
      ...prev,
      [providerId]: (prev[providerId] || []).map(account =>
        account.id === accountId ? { ...account, notifications: count } : account
      )
    }));
  };

  const clearAccountNotifications = (providerId: number, accountId: number) => {
    setAccounts(prev => ({
      ...prev,
      [providerId]: (prev[providerId] || []).map(account =>
        account.id === accountId
          ? { ...account, notifications: 0 }
          : account
      )
    }));
  };

  const handleRemoveProvider = (providerId: number) => {
    if (providers.length <= 1) {
      alert("You must have at least one provider connected.");
      return;
    }

    const provider = providers.find(p => p.id === providerId);
    if (!provider || !confirm(`Are you sure you want to remove ${provider.name}?`)) return;

    // Remove provider
    setProviders(prev => prev.filter(p => p.id !== providerId));

    // Switch to first available provider if removing active one
    if (activeProviderId === providerId) {
      const remainingProviders = providers.filter(p => p.id !== providerId);
      if (remainingProviders.length > 0) {
        setActiveProviderId(remainingProviders[0].id);
        const providerAccounts = accounts[remainingProviders[0].id];
        if (providerAccounts && providerAccounts.length > 0) {
          setActiveAccountId(providerAccounts[0].id);
        }
      }
    }

    setShowSettingsModal(false);
    alert(`${provider.name} has been removed.`);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  };

  const handleOpenInNewWindow = () => {
    const url = providerUrls[activeProviderId];
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleFullscreen = () => {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(console.log);
    } else {
      document.exitFullscreen();
    }
  };

  const handleAddAccount = () => {
    if (!currentProvider) return;
    const nextIdBase = (accounts[activeProviderId]?.[accounts[activeProviderId].length - 1]?.id || (activeProviderId * 100)) + 1;
    const newAccount: Account = {
      id: nextIdBase,
      name: `Account ${accounts[activeProviderId]?.length ? accounts[activeProviderId].length + 1 : 1}`,
      notifications: 0,
      color: currentProvider.color
    };
    setAccounts(prev => ({
      ...prev,
      [activeProviderId]: [...(prev[activeProviderId] || []), newAccount]
    }));
    setActiveAccountId(newAccount.id);
  };

  const handleAddProvider = (provider: Pick<Provider, 'id' | 'name' | 'icon' | 'color'>) => {
    if (providers.some(p => p.id === provider.id)) {
      alert(`${provider.name} is already added.`);
      return;
    }
    const newProvider: Provider = { ...provider, notifications: 0 };
    setProviders(prev => [...prev, newProvider]);
    // Add default account
    setAccounts(prev => ({
      ...prev,
      [provider.id]: [{ id: provider.id * 100 + 1, name: 'Account 1', notifications: 0, color: provider.color }]
    }));
    setActiveProviderId(provider.id);
    setActiveAccountId(provider.id * 100 + 1);
    setShowAddProviderModal(false);
    setProviderSearch('');
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, providerId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', providerId.toString());
    // Delay state update to allow drag to start smoothly
    requestAnimationFrame(() => setDraggedProviderId(providerId));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetProviderId: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Get dragged ID from state or dataTransfer as fallback
    let sourceId = draggedProviderId;
    if (sourceId === null) {
      const data = e.dataTransfer.getData('text/plain');
      if (data) sourceId = parseInt(data, 10);
    }

    if (sourceId === null || sourceId === targetProviderId) {
      setDraggedProviderId(null);
      return;
    }

    const draggedIndex = providers.findIndex(p => p.id === sourceId);
    const targetIndex = providers.findIndex(p => p.id === targetProviderId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedProviderId(null);
      return;
    }

    const newProviders = [...providers];
    const [draggedItem] = newProviders.splice(draggedIndex, 1);
    newProviders.splice(targetIndex, 0, draggedItem);

    setProviders(newProviders);
    setDraggedProviderId(null);
  };

  const handleDragEnd = () => {
    setDraggedProviderId(null);
  };

  // Render pooled webviews: keep all accounts mounted, show/hide instead of remounting
  const stableProviders = useMemo(() => [...providers].sort((a, b) => a.id - b.id), [providers]);

  const renderWebviewsPool = () => {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {stableProviders.map(p => (
          (accounts[p.id] || []).map(a => {
            const k = `${p.id}-${a.id}`;
            const visible = p.id === activeProviderId && a.id === activeAccountId;
            // Lazy load: Only load if visible, OR if it has been loaded before AND background updates are enabled.
            const hasBeenLoaded = loadedAccountKeys.includes(k);
            const shouldLoad = visible || (backgroundUpdatesEnabled && hasBeenLoaded);

            const url = shouldLoad ? (providerUrls[p.id] || 'about:blank') : 'about:blank';
            return (
              <AccountWebView
                key={`pool-${p.id}-${a.id}`}
                providerId={p.id}
                accountId={a.id}
                url={url}
                visible={visible}
                backgroundUpdatesEnabled={backgroundUpdatesEnabled}
                onUnreadChange={setUnreadCount}
              />
            );
          })
        ))}
        {isLoading && (
          <div className="loading-container" style={{ position: 'absolute', inset: 0 }}>
            <div className="spinner"></div>
          </div>
        )}
      </div>
    );
  };

  // Render Modals
  const renderSettingsModal = () => (
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
                <div className="settings-provider-icon" >
                  <img src={provider.icon} style={{ width: '100%' }} draggable={false} />
                </div>
                <div className="settings-provider-info">
                  <div className="settings-provider-name">{provider.name}</div>
                  <div className="settings-provider-status">
                    <span>•</span>
                    <span>{provider.notifications} unread</span>
                  </div>
                </div>
                <div className="settings-provider-actions">
                  <div className="action-btn remove"
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
          <button className="btn btn-primary" onClick={() => setShowSettingsModal(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const handleResetApp = async () => {
    if (confirm('Are you sure you want to reset the app? This will delete all accounts, settings, and sessions (Factory Reset).')) {
      // Clear localStorage
      localStorage.clear();
      
      // Clear Electron sessions
      if ((window as any).electronAPI?.clearAllData) {
        await (window as any).electronAPI.clearAllData();
      }

      // Reload
      window.location.reload();
    }
  };

  return (
    <div className="account-manager">
      {/* Sidebar */}
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
              draggable={true}
              onDragStart={(e) => handleDragStart(e, provider.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, provider.id)}
              onDragEnd={handleDragEnd}
              style={{ opacity: draggedProviderId === provider.id ? 0.5 : 1, cursor: 'grab' }}
            >
              <div
                  className={`provider-icon ${activeProviderId === provider.id ? 'active' : ''}`}
                  title={provider.name}
                  onClick={() => handleProviderClick(provider.id)}
                >
                  <img src={provider.icon} style={{ width: '100%' }} draggable={false} />
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
            <i className="fa-solid fa-plus" ></i>
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
        {/* Top Bar */}
        <div className="top-bar">
          <div className="accounts-scroll">
            {accounts[activeProviderId]?.map(account => (
              <div
                key={account.id}
                className={`account-card ${activeAccountId === account.id ? 'active' : ''}`}
                onClick={() => handleAccountClick(account.id)}
                onContextMenu={(e) => {
                  handleAccountContextMenu(e, activeProviderId, account.id, account.name);
                }}
              >
                <div className="account-icon">
                  <img src={currentProvider?.icon} style={{ width: "100%" }} />
                  {account.notifications > 0 && (
                    <div className="account-notification">
                      {account.notifications > 99 ? '99+' : account.notifications}
                    </div>
                  )}
                </div>
                <div className="account-name">{account.name}</div>
               
              </div>
            ))}
            <div className="add-account-btn" onClick={handleAddAccount}>
              <i className="fa-solid fa-plus"></i> 
            </div>
          </div>
          
      
        </div>

        {/* Web View Area */}
        <div className="webview-area">
          <div className="webview-header">
            <div className="webview-title">
              <div className="webview-title-icon" >
                <img src={currentProvider?.icon} style={{ width: '100%' }} />
              </div>
              <span>{currentProvider ? `${currentProvider.name}${currentAccount ? ` • ${currentAccount.name}` : ''}` : 'Select a Provider'}</span>
            </div>

              <div className="webview-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 10 }}>
             
             <div className="window-controls" style={{ display: 'flex', gap: 8 }}>
               <i className="fa-solid fa-expand" onClick={handleFullscreen} title="Fullscreen" style={{ cursor: 'pointer', padding: 5 }}></i>
               <i className="fa-solid fa-external-link-alt" onClick={handleOpenInNewWindow} title="Open in Browser" style={{ cursor: 'pointer', padding: 5 }}></i>
               <i className="fa-solid fa-sync-alt" onClick={handleRefresh} title="Refresh" style={{ cursor: 'pointer', padding: 5 }}></i>
             </div>
          </div>
          </div>

          <div className="webview-container">
            {renderWebviewsPool()}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {renderSettingsModal()}

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
                placeholder="Enter account name"
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setShowEditAccountModal(false)}>
              Cancel
            </button>
            <button className="btn-save" onClick={saveEditAccount}>
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setShowContextMenu(false)}></div>
          <div
            className="context-menu"
            style={{
              left: `${contextMenuPosition.x}px`,
              top: `${contextMenuPosition.y}px`
            }}
          >
            <div
              className="context-menu-item"
              onClick={() => {
                if (contextProviderId && contextAccountId) {
                  openEditAccount(contextProviderId, contextAccountId);
                }
                setShowContextMenu(false);
              }}
            >
              <i className="fas fa-edit"></i> Edit Name
            </div>
            <div
              className="context-menu-item delete"
              onClick={() => {
                if (contextProviderId && contextAccountId) {
                  deleteAccountDirect(contextProviderId, contextAccountId);
                }
                setShowContextMenu(false);
              }}
            >
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
              {filteredProviders.map(provider => (
                <div key={provider.id} className="provider-grid-item" onClick={() => handleAddProvider(provider)}>
                  <div className="provider-grid-icon">
                    <img src={provider.icon} style={{ width: '100%' }} />
                  </div>
                  <div className="provider-grid-name">{provider.name}</div>
                </div>
              ))}
              {filteredProviders.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#666' }}>
                  No providers found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Support Modal */}
      {showSupportModal && (
        <div className={`modal active`} onClick={() => setShowSupportModal(false)}>
           <div className="modal-content simple-modal" onClick={e => e.stopPropagation()}>
             <div className="modal-header">
               <div className="modal-title">About SocialHub</div>
               <div className="modal-close" onClick={() => setShowSupportModal(false)}>
                 <i className="fas fa-times"></i>
               </div>
             </div>
             <div className="modal-body" style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: 15 }}>
                  <img src="./icons/icon.png" style={{ width: 64, height: 64 }} />
                </div>
                <h3>SocialHub Messenger</h3>
                <p>Version 1.0.0</p>
                <p style={{ marginTop: 10, color: '#666' }}>All-in-one messenger for your desktop.</p>
             </div>
             <div className="modal-footer">
               <button className="btn btn-primary" onClick={() => setShowSupportModal(false)}>Close</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AccountManager;
