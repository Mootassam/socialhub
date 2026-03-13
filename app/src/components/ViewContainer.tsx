// ViewContainer — renders a placeholder div for the active webview.
// Actual webview rendering is done in App.tsx via the AccountWebView pool.
// This file is kept for potential future BrowserView integration.

export default function ViewContainer() {
  return (
    <div
      className="view-container"
      style={{ width: '100%', height: '100%', background: 'var(--bg-secondary)', position: 'relative' }}
    />
  );
}
