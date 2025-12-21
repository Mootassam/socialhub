import React, { useState, useEffect } from 'react';

const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [version, setVersion] = useState<string>('');
  const [downloading, setDownloading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [updateReady, setUpdateReady] = useState<boolean>(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    // Check for updates on mount
    api.checkForUpdates();

    // Listeners
    api.onUpdateAvailable((info: any) => {
      setUpdateAvailable(true);
      setVersion(info.version);
    });

    api.onDownloadProgress((progressObj: any) => {
      setDownloading(true);
      setProgress(progressObj.percent);
    });

    api.onUpdateDownloaded(() => {
      setDownloading(false);
      setUpdateReady(true);
    });

  }, []);

  const startDownload = () => {
    const api = (window as any).electronAPI;
    if (api) {
      api.startDownloadUpdate();
      setDownloading(true);
    }
  };

  const restartApp = () => {
    const api = (window as any).electronAPI;
    if (api) {
      api.quitAndInstallUpdate();
    }
  };

  if (!updateAvailable && !downloading && !updateReady) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '#1e1e1e',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      zIndex: 9999,
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: '250px',
      border: '1px solid #333'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold' }}>
          {updateReady ? 'Update Ready' : downloading ? 'Downloading Update...' : 'Update Available'}
        </span>
        {version && <span style={{ fontSize: '0.8em', color: '#aaa' }}>v{version}</span>}
      </div>

      {downloading && (
        <div style={{ width: '100%', backgroundColor: '#333', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ 
            width: `${progress}%`, 
            backgroundColor: '#00B2FF', 
            height: '100%', 
            transition: 'width 0.3s ease' 
          }} />
        </div>
      )}

      {!downloading && !updateReady && (
        <button 
          onClick={startDownload}
          style={{
            backgroundColor: '#00B2FF',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Download Update
        </button>
      )}

      {updateReady && (
        <button 
          onClick={restartApp}
          style={{
            backgroundColor: '#25d366',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Restart to Update
        </button>
      )}
    </div>
  );
};

export default UpdateNotification;
