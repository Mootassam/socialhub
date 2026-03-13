import { ALL_PROVIDERS } from '../data/providers';

export default function Sidebar({ active, onSelect }: { active: number; onSelect: (id: number) => void }) {
  return (
    <div className="sidebar">
      {ALL_PROVIDERS.map(p => (
        <div
          key={p.id}
          className={`provider-icon ${active === p.id ? 'active' : ''}`}
          onClick={() => onSelect(p.id)}
        >
          <i className={p.icon}></i>
        </div>
      ))}
    </div>
  );
}
