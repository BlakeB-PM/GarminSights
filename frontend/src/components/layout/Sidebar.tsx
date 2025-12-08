import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Dumbbell,
  MessageCircle,
  Settings,
  RefreshCw,
  Table2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/data', icon: Table2, label: 'Data Viewer' },
  { to: '/activities', icon: Activity, label: 'Activities' },
  { to: '/strength', icon: Dumbbell, label: 'Strength' },
  { to: '/coach', icon: MessageCircle, label: 'AI Coach' },
];

interface SidebarProps {
  onSync?: () => void;
  isSyncing?: boolean;
}

export function Sidebar({ onSync, isSyncing }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-card/50 backdrop-blur-sm border-r border-card-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-100">GarminSights</h1>
            <p className="text-xs text-gray-500">Fitness Analytics</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('sidebar-link', isActive && 'active')
            }
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-card-border space-y-2">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            'sidebar-link w-full',
            isSyncing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-5 h-5', isSyncing && 'animate-spin')} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
        </button>
        
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('sidebar-link', isActive && 'active')
          }
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}

