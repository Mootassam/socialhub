import React, { useState, useEffect, useCallback } from 'react';

const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version,         setVersion]         = useState('');
  const [downloading,     setDownloading]     = useState(false);
  const [progress,        setProgress]        = useState(0);
  const [updateReady,     setUpdateReady]     = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info: any) => {
      setUpdateAvailable(true);
      setVersion(info?.version ?? '');
    });

    api.onDownloadProgress?.((obj: any) => {
      setDownloading(true);
      setProgress(Math.round(obj?.percent ?? 0));
    });

    api.onUpdateDownloaded?.(() => {
      setDownloading(false);
      setUpdateReady(true);
    });

    // Cleanup on unmount — removes all auto-update IPC listeners
    return () => {
      try { api.offUpdateListeners?.(); } catch {}
    };
  }, []);

  const startDownload = useCallback(() => {
    const api = (window as any).electronAPI;
    api?.startDownloadUpdate?.();
    setDownloading(true);
  }, []);

  const restartApp = useCallback(() => {
    const api = (window as any).electronAPI;
    api?.quitAndInstallUpdate?.();
  }, []);

  if (!updateAvailable && !downloading && !updateReady) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: '#1e1e2e',
      padding: '14px 16px',
      borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      zIndex: 9999,
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minWidth: 260,
      border: '1px solid #333',
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>
          {updateReady ? '✅ Update Ready' : downloading ? '⬇ Downloading…' : '🔔 Update Available'}
        </span>
        {version && <span style={{ fontSize: '0.8em', color: '#aaa' }}>v{version}</span>}
      </div>

      {downloading && (
        <div style={{ width: '100%', background: '#333', height: 5, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`,
            background: '#3b82f6',
            height: '100%',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {!downloading && !updateReady && (
        <button
          onClick={startDownload}
          style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          Download Update
        </button>
      )}

      {updateReady && (
        <button
          onClick={restartApp}
          style={{ background: '#25d366', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          Restart to Update
        </button>
      )}
    </div>
  );
};

export default UpdateNotification;
