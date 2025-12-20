declare global {
  interface Window {
    electron: any;
  }
}

export default function WebView({ provider, account }: any) {
  if (!provider || !account) return null;

  const open = () => {
    window.electron.openSession({
      providerId: provider.id,
      accountId: account.id,
      url: provider.url,
    });
  };

  return (
    <button onClick={open} style={{ display: "none" }}>
      Open
    </button>
  );
}
