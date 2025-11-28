'use client';

import { useEffect, useState } from 'react';

interface SyncStatus {
  lastSyncTime: string | null;
  daysSinceLastSync: number | null;
  dataFreshness: 'fresh' | 'stale' | 'unknown';
  needsSync: boolean;
}

export default function DataFreshnessIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        setStatus(data);
      } catch (error) {
        console.error('Failed to fetch sync status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStatus();
    // Refresh every 5 minutes
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  if (loading || !status) {
    return null;
  }
  
  const freshnessColors = {
    fresh: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
    stale: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
    unknown: 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-800',
  };
  
  const formatLastSync = () => {
    if (!status.lastSyncTime) return 'Never';
    const date = new Date(status.lastSyncTime);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (status.daysSinceLastSync !== null) {
      if (status.daysSinceLastSync === 1) return '1 day ago';
      return `${status.daysSinceLastSync} days ago`;
    }
    return date.toLocaleDateString();
  };
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${freshnessColors[status.dataFreshness]}`}>
      <div className={`w-2 h-2 rounded-full ${
        status.dataFreshness === 'fresh' ? 'bg-green-500' :
        status.dataFreshness === 'stale' ? 'bg-yellow-500' :
        'bg-gray-500'
      }`} />
      <span>
        Data synced: {formatLastSync()}
      </span>
      {status.needsSync && (
        <span className="ml-2 text-xs font-medium">
          (Sync recommended)
        </span>
      )}
    </div>
  );
}

