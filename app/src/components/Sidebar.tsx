import { providers } from "../data/providers";

export default function Sidebar({ active, onSelect }: any) {
  return (
    <div className="sidebar">
      {providers.map(p => (
        <div
          key={p.id}
          className={`provider-icon ${active === p.id ? "active" : ""}`}
          onClick={() => onSelect(p.id)}
        >
          <i className={p.icon}></i>
        </div>
      ))}
    </div>
  );
}
