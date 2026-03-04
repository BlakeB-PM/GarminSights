import { Bell, User, Menu } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuToggle?: () => void;
}

export function Header({ title, subtitle, onMenuToggle }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-4 md:mb-8">
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-card transition-colors text-gray-400 hover:text-gray-100"
            onClick={onMenuToggle}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 rounded-lg hover:bg-card transition-colors text-gray-400 hover:text-gray-100">
          <Bell className="w-5 h-5" />
        </button>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-card transition-colors">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <User className="w-4 h-4 text-accent" />
          </div>
        </button>
      </div>
    </header>
  );
}
