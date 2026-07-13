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
import { syncData, type SyncStatus, onAccessSessionExpired } from './lib/api';

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
  const [syncResult, setSyncResult] = useState<{ status: SyncStatus; ts: number } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Surface an expired Cloudflare Access session as a banner. This is
  // purely informational — we never auto-redirect or auto-reload here (see
  // the comment above onAccessSessionExpired in lib/api.ts for why). The
  // user decides when to reload, which is what actually re-triggers the
  // Access login gate.
  useEffect(() => {
    const unsubscribe = onAccessSessionExpired(() => setSessionExpired(true));
    return unsubscribe;
  }, []);

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

  // Auto-dismiss sync result toast after 5 seconds
  useEffect(() => {
    if (!syncResult) return;
    const timer = setTimeout(() => setSyncResult(null), 5000);
    return () => clearTimeout(timer);
  }, [syncResult]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncData(30);
      queryClient.invalidateQueries();
      setSyncResult({ status: result, ts: Date.now() });
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncResult({
        status: { success: false, activities_synced: 0, sleep_days_synced: 0, dailies_synced: 0, strength_sets_extracted: 0, error: String(error) },
        ts: Date.now(),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const menuToggleProps = { onMenuToggle: () => setIsMobileMenuOpen(true) };

  return (
    <div className="min-h-screen">
      {/* Cloudflare Access session-expired banner. Shown once and left up —
          the user dismisses or reloads on their own terms; we never
          auto-redirect or auto-reload (see lib/api.ts). */}
      {sessionExpired && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-3 bg-amber-900/95 border-b border-amber-700 text-amber-100 px-4 py-2 text-sm shadow-lg">
          <span>Your sign-in session has expired.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-amber-700 hover:bg-amber-600 px-3 py-1 font-semibold text-amber-50"
          >
            Sign in again
          </button>
          <button
            type="button"
            onClick={() => setSessionExpired(false)}
            aria-label="Dismiss"
            className="ml-1 text-amber-200 hover:text-amber-50"
          >
            &times;
          </button>
        </div>
      )}

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

      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm shadow-lg max-w-sm ${
            syncResult.status.success
              ? 'bg-green-900/90 border border-green-700 text-green-100'
              : 'bg-red-900/90 border border-red-700 text-red-100'
          }`}
        >
          {syncResult.status.success ? (
            <div>
              <p className="font-semibold mb-1">Sync complete</p>
              <p className="text-xs opacity-80">
                {syncResult.status.activities_synced} activities &middot; {syncResult.status.sleep_days_synced} sleep days &middot; {syncResult.status.dailies_synced} daily records
              </p>
              {syncResult.status.warnings && syncResult.status.warnings.length > 0 && (
                <p className="text-xs opacity-70 mt-1">{syncResult.status.warnings[0]}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="font-semibold mb-1">Sync failed</p>
              <p className="text-xs opacity-80">{syncResult.status.error ?? 'Unknown error'}</p>
            </div>
          )}
        </div>
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
            <Route path="/settings" element={<Settings {...menuToggleProps} />} />
          </Routes>
        </div>
        <Routes>
          <Route path="/coach" element={<Coach {...menuToggleProps} />} />
        </Routes>
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
