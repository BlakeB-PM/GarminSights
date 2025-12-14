import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Dumbbell,
  MessageCircle,
  Settings,
  RefreshCw,
  Table2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/strength', icon: Dumbbell, label: 'Strength Lab' },
  { to: '/data', icon: Table2, label: 'Data Viewer' },
  { to: '/activities', icon: Activity, label: 'Activities' },
  { to: '/coach', icon: MessageCircle, label: 'AI Coach' },
];

interface SidebarProps {
  onSync?: () => void;
  isSyncing?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ onSync, isSyncing, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-card/50 backdrop-blur-sm border-r border-card-border flex flex-col z-40 transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center flex-shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-100">GarminSights</h1>
              <p className="text-xs text-gray-500">Fitness Analytics</p>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="ml-auto p-1.5 rounded-lg hover:bg-card transition-colors text-gray-400 hover:text-gray-100 flex-shrink-0"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'sidebar-link',
                isActive && 'active',
                isCollapsed && 'justify-center'
              )
            }
            title={isCollapsed ? label : undefined}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>{label}</span>}
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
            isSyncing && 'opacity-50 cursor-not-allowed',
            isCollapsed && 'justify-center'
          )}
          title={isCollapsed ? (isSyncing ? 'Syncing...' : 'Sync Data') : undefined}
        >
          <RefreshCw className={cn('w-5 h-5 flex-shrink-0', isSyncing && 'animate-spin')} />
          {!isCollapsed && <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>}
        </button>
        
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'sidebar-link',
              isActive && 'active',
              isCollapsed && 'justify-center'
            )
          }
          title={isCollapsed ? 'Settings' : undefined}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
}

