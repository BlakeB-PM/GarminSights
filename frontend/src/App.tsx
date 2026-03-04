import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { DataViewer } from './pages/DataViewer';
import { ActivityLog } from './pages/ActivityLog';
import { StrengthAnalytics } from './pages/StrengthAnalytics';
import { CyclingAnalytics } from './pages/CyclingAnalytics';
import { Coach } from './pages/Coach';
import { Settings } from './pages/Settings';
import { syncData } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppLayout() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auto-collapse sidebar on smaller screens (landscape mobile)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsSidebarCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Close mobile menu when resizing to tablet/desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setIsMobileMenuOpen(false); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncData(30);
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const menuToggleProps = { onMenuToggle: () => setIsMobileMenuOpen(true) };

  return (
    <div className="min-h-screen">
      <Sidebar
        onSync={handleSync}
        isSyncing={isSyncing}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content — no left margin on mobile (sidebar is overlay) */}
      <main className={`transition-all duration-300 p-3 md:p-6 ${isSidebarCollapsed ? 'sm:ml-16' : 'sm:ml-64'}`}>
        <div className="max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard {...menuToggleProps} />} />
            <Route path="/data" element={<DataViewer {...menuToggleProps} />} />
            <Route path="/activities" element={<ActivityLog {...menuToggleProps} />} />
            <Route path="/strength" element={<StrengthAnalytics {...menuToggleProps} />} />
            <Route path="/cycling" element={<CyclingAnalytics {...menuToggleProps} />} />
            <Route path="/coach" element={<Coach {...menuToggleProps} />} />
            <Route path="/settings" element={<Settings {...menuToggleProps} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
