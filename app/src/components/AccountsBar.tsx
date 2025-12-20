export default function AccountsBar({ accounts, active, onSelect }: any) {
  return (
    <div className="accounts-scroll">
      {accounts.map((acc: any) => (
        <div
          key={acc.id}
          className={`account-card ${active === acc.id ? "active" : ""}`}
          onClick={() => onSelect(acc.id)}
        >
          <div className="account-icon">
            {acc.name[0]}
          </div>
          <div className="account-name">{acc.name}</div>
        </div>
      ))}
    </div>
  );
}
