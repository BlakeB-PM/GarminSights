import { Bell, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
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

