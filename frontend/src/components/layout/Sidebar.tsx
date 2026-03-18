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
  Bike,
  Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/strength', icon: Dumbbell, label: 'Strength Lab' },
  { to: '/cycling', icon: Bike, label: 'Cycling' },
  { to: '/data', icon: Table2, label: 'Data Viewer' },
  { to: '/activities', icon: Activity, label: 'Activities' },
  { to: '/coach', icon: MessageCircle, label: 'AI Coach' },
];

interface SidebarProps {
  onSync?: () => void;
  isSyncing?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  onInstall?: () => void;
}

export function Sidebar({ onSync, isSyncing, isCollapsed = false, onToggleCollapse, isMobileOpen = false, onMobileClose, onInstall }: SidebarProps) {
  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-card/50 backdrop-blur-sm border-r border-card-border flex flex-col z-40 transition-all duration-300",
      // Mobile: slides in/out as overlay (always full width when open)
      isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full sm:translate-x-0",
      // Tablet/desktop: width based on collapsed state
      isCollapsed ? "sm:w-16" : "sm:w-64"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center flex-shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          {(!isCollapsed || isMobileOpen) && (
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-100">GarminSights</h1>
              <p className="text-xs text-gray-500">Fitness Analytics</p>
            </div>
          )}
          <button
            onClick={isMobileOpen ? onMobileClose : onToggleCollapse}
            className="ml-auto p-1.5 rounded-lg hover:bg-card transition-colors text-gray-400 hover:text-gray-100 flex-shrink-0"
            title={isCollapsed && !isMobileOpen ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed && !isMobileOpen ? (
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
            onClick={isMobileOpen ? onMobileClose : undefined}
            className={({ isActive }) =>
              cn(
                'sidebar-link',
                isActive && 'active',
                isCollapsed && !isMobileOpen && 'justify-center'
              )
            }
            title={isCollapsed && !isMobileOpen ? label : undefined}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-card-border space-y-2">
        {onInstall && (
          <button
            onClick={onInstall}
            className={cn(
              'sidebar-link w-full',
              isCollapsed && !isMobileOpen && 'justify-center'
            )}
            title={isCollapsed && !isMobileOpen ? 'Install App' : undefined}
          >
            <Download className="w-5 h-5 flex-shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span>Install App</span>}
          </button>
        )}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            'sidebar-link w-full',
            isSyncing && 'opacity-50 cursor-not-allowed',
            isCollapsed && !isMobileOpen && 'justify-center'
          )}
          title={isCollapsed && !isMobileOpen ? (isSyncing ? 'Syncing...' : 'Sync Data') : undefined}
        >
          <RefreshCw className={cn('w-5 h-5 flex-shrink-0', isSyncing && 'animate-spin')} />
          {(!isCollapsed || isMobileOpen) && <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>}
        </button>

        <NavLink
          to="/settings"
          onClick={isMobileOpen ? onMobileClose : undefined}
          className={({ isActive }) =>
            cn(
              'sidebar-link',
              isActive && 'active',
              isCollapsed && !isMobileOpen && 'justify-center'
            )
          }
          title={isCollapsed && !isMobileOpen ? 'Settings' : undefined}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {(!isCollapsed || isMobileOpen) && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
}
