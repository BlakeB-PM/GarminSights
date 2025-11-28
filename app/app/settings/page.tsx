'use client';

import { useState, useEffect, useRef } from 'react';
import DataFreshnessIndicator from '../components/insights/DataFreshnessIndicator';

export default function SettingsPage() {
  const [garminUsername, setGarminUsername] = useState<string>('');
  const [garminPassword, setGarminPassword] = useState<string>('');
  const [credentialsSaved, setCredentialsSaved] = useState<boolean>(false);
  const [savingCredentials, setSavingCredentials] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncStage, setSyncStage] = useState<string>('');
  const [syncMessages, setSyncMessages] = useState<string[]>([]);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [syncStatusData, setSyncStatusData] = useState<any>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProgressUpdateRef = useRef<number>(0);
  const lastProgressMessageRef = useRef<string>('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Check if credentials are already saved on mount
  useEffect(() => {
    const checkCredentials = async () => {
      try {
        const res = await fetch('/api/garmin/credentials');
        const data = await res.json();
        if (data.hasCredentials && data.username) {
          setCredentialsSaved(true);
          setGarminUsername(data.username);
        }
      } catch (err) {
        console.error('Failed to check credentials:', err);
      }
    };
    checkCredentials();

    // Fetch sync status
    const fetchSyncStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        setSyncStatusData(data);
      } catch (err) {
        console.error('Failed to fetch sync status:', err);
      }
    };
    fetchSyncStatus();
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (eventSource) {
        eventSource.close();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [eventSource]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && syncing) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncMessages, syncing]);

  // Handle saving credentials
  const handleSaveCredentials = async (e: React.FormEvent<HTMLFormElement>) => {
    // Prevent default form submission immediately - this is critical!
    e.preventDefault();
    e.stopPropagation();
    
    // Immediately preserve current values before any async operations
    const currentUsername = garminUsername;
    const currentPassword = garminPassword;
    
    console.log('Form submitted', { 
      username: currentUsername, 
      hasPassword: !!currentPassword,
      credentialsSaved 
    });
    
    setSyncStatus(null);
    setSavingCredentials(true);
    
    // Store current values to preserve them on error
    const usernameToSave = currentUsername.trim();
    const passwordToSave = currentPassword.trim();
    
    // Validate inputs - but preserve state even on validation errors
    if (!usernameToSave) {
      setSyncStatus('Error: Username is required');
      setSavingCredentials(false);
      // Ensure state is preserved
      setGarminUsername(currentUsername);
      setGarminPassword(currentPassword);
      return;
    }
    
    if (!credentialsSaved && !passwordToSave) {
      setSyncStatus('Error: Password is required');
      setSavingCredentials(false);
      // Ensure state is preserved
      setGarminUsername(currentUsername);
      setGarminPassword(currentPassword);
      return;
    }
    
    try {
      console.log('Sending request to /api/garmin/credentials');
      const res = await fetch('/api/garmin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameToSave,
          password: passwordToSave || undefined,
        }),
      });
      
      console.log('Response received', { status: res.status, ok: res.ok });
      
      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Server returned non-JSON response (${res.status}): ${text || res.statusText}`);
      }
      
      console.log('Parsed response:', data);
      
      if (res.ok && data.success !== false) {
        setCredentialsSaved(true);
        setSyncStatus('Credentials saved successfully!');
        // Only clear password, keep username
        setGarminPassword('');
        // Ensure username is preserved
        setGarminUsername(usernameToSave);
        console.log('Credentials saved successfully');
      } else {
        // Preserve form state on error - restore values
        setGarminUsername(usernameToSave);
        setGarminPassword(passwordToSave);
        const errorMsg = data.error || data.message || 'Failed to save credentials';
        setSyncStatus(`Error: ${errorMsg}`);
        console.error('Save failed:', errorMsg);
      }
    } catch (err) {
      // Preserve form state on error - restore values
      setGarminUsername(usernameToSave);
      setGarminPassword(passwordToSave);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save credentials';
      setSyncStatus(`Error: ${errorMessage}`);
      console.error('Error saving credentials:', err);
    } finally {
      setSavingCredentials(false);
    }
  };

  // Handle syncing data from Garmin
  const handleSyncData = async () => {
    setSyncing(true);
    setSyncStatus('Initializing sync process...');
    setSyncStage('initializing');
    setSyncMessages(['Connecting to Garmin Connect...']);
    
    try {
      const es = new EventSource('/api/garmin/sync/stream');
      setEventSource(es);
      
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'start':
              setSyncStatus(data.message);
              setSyncStage('starting');
              break;
              
            case 'progress':
              // Debounce progress updates to prevent UI blinking
              const now = Date.now();
              const isProgressUpdate = /(\d+)\s+of\s+(\d+)/.test(data.message);
              const timeSinceLastUpdate = now - lastProgressUpdateRef.current;
              const THROTTLE_MS = 5000; // 5 seconds for progress updates
              
              // Extract message content without timestamps for comparison
              const messageContent = data.message.replace(/\s*-\s*Elapsed:.*?,\s*Est\.\s*remaining:.*?/g, '').trim();
              const isDuplicate = messageContent === lastProgressMessageRef.current && isProgressUpdate;
              
              // Only update if:
              // 1. Not a duplicate message (same content)
              // 2. Enough time has passed (throttling)
              // 3. Not a progress update (always show non-progress messages)
              // 4. Component is still mounted
              if (isMountedRef.current && (!isProgressUpdate || !isDuplicate || timeSinceLastUpdate >= THROTTLE_MS)) {
                // Clear any pending timeout
                if (updateTimeoutRef.current) {
                  clearTimeout(updateTimeoutRef.current);
                  updateTimeoutRef.current = null;
                }
                
                // For progress updates, use a small debounce to batch rapid updates
                const updateUI = () => {
                  if (!isMountedRef.current) return;
                  
                  setSyncStage(data.stage || 'processing');
                  setSyncStatus(data.message);
                  setSyncMessages((prev) => {
                    // Check if this is a progress update (contains "X of Y" pattern)
                    if (isProgressUpdate && prev.length > 0) {
                      // Check if the last message was also a progress update
                      const lastIsProgress = /(\d+)\s+of\s+(\d+)/.test(prev[prev.length - 1]);
                      
                      if (lastIsProgress) {
                        // Replace the last message instead of appending
                        const updated = [...prev];
                        updated[updated.length - 1] = data.message;
                        return updated;
                      }
                    }
                    
                    // Append new message for non-progress updates or first progress update
                    const updated = [...prev, data.message];
                    // Keep last 20 messages instead of 10 for better context
                    return updated.slice(-20);
                  });
                  
                  lastProgressUpdateRef.current = now;
                  lastProgressMessageRef.current = messageContent;
                };
                
                // For progress updates, debounce by 300ms to batch rapid updates
                if (isProgressUpdate && timeSinceLastUpdate < 300) {
                  updateTimeoutRef.current = setTimeout(updateUI, 300);
                } else {
                  updateUI();
                }
              }
              break;
              
            case 'success':
              setSyncStatus('✓ ' + data.message);
              setSyncStage('completed');
              es.close();
              setEventSource(null);
              
              // Refresh sync status
              setTimeout(async () => {
                try {
                  const statusRes = await fetch('/api/sync/status');
                  const statusData = await statusRes.json();
                  setSyncStatusData(statusData);
                } catch (err) {
                  console.error('Failed to refresh sync status:', err);
                }
              }, 1000);
              
              setTimeout(() => {
                setSyncing(false);
              }, 2000);
              break;
              
            case 'error':
              setSyncStatus('✗ Error: ' + data.message);
              setSyncStage('error');
              if (data.details) {
                setSyncMessages((prev) => [...prev, `Details: ${data.details}`]);
              }
              es.close();
              setEventSource(null);
              setSyncing(false);
              break;
              
            case 'warning':
              setSyncMessages((prev) => [...prev, `⚠ ${data.message}`]);
              break;
          }
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };
      
      es.onerror = (error) => {
        console.error('EventSource error:', error);
        setSyncStatus('✗ Connection error. Sync may still be running in the background.');
        setSyncStage('error');
        es.close();
        setEventSource(null);
        setSyncing(false);
      };
      
    } catch (err) {
      setSyncStatus(`✗ Error: ${err instanceof Error ? err.message : 'Failed to start sync'}`);
      setSyncStage('error');
      setSyncing(false);
    }
  };

  // Handle canceling sync
  const handleCancelSync = async () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    
    try {
      const response = await fetch('/api/garmin/sync/cancel', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        setSyncStatus('✗ Sync cancelled');
        setSyncStage('cancelled');
        setSyncMessages((prev) => [...prev, data.message || 'Sync process cancelled']);
      } else {
        setSyncStatus('✗ Error cancelling sync: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setSyncStatus('✗ Error cancelling sync: ' + (err instanceof Error ? err.message : 'Failed to cancel'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="container mx-auto p-6 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Manage your Garmin connection and data sync
        </p>
      </div>

      {/* Data Sync Status */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Data Sync Status
        </h2>
        <div className="mb-4">
          <DataFreshnessIndicator />
        </div>
        {syncStatusData && (
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <div>Databases found: {syncStatusData.databasesFound || 0}</div>
            {syncStatusData.rowCounts && (
              <div>
                Data rows: {Object.entries(syncStatusData.rowCounts).map(([key, value]) => 
                  `${key}: ${value}`
                ).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Garmin Credentials */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Garmin Connection
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter your Garmin Connect credentials to download and sync your workout data.
        </p>
        <form 
          ref={formRef}
          onSubmit={handleSaveCredentials} 
          onReset={(e) => {
            e.preventDefault();
            console.log('Form reset prevented');
          }}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="garmin_username" className="block text-sm font-medium mb-2">
                Garmin Username/Email
              </label>
              <input
                id="garmin_username"
                type="text"
                value={garminUsername}
                onChange={(e) => setGarminUsername(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
                disabled={savingCredentials}
              />
            </div>
            <div>
              <label htmlFor="garmin_password" className="block text-sm font-medium mb-2">
                Garmin Password
              </label>
              <input
                id="garmin_password"
                type="password"
                value={garminPassword}
                onChange={(e) => setGarminPassword(e.target.value)}
                placeholder={credentialsSaved ? "••••••••" : "Enter your password"}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required={!credentialsSaved}
                disabled={savingCredentials}
              />
              {credentialsSaved && (
                <p className="text-xs text-gray-500 mt-1">Leave blank to keep existing password</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              disabled={savingCredentials}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
            >
              {savingCredentials ? 'Saving...' : (credentialsSaved ? 'Update Credentials' : 'Save Credentials')}
            </button>
            <button
              type="button"
              onClick={handleSyncData}
              disabled={syncing || !credentialsSaved}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync Data from Garmin'}
            </button>
            {syncing && (
              <button
                type="button"
                onClick={handleCancelSync}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors"
              >
                Cancel Sync
              </button>
            )}
          </div>
          {syncStatus && (
            <div className="space-y-2">
              <div className={`p-3 rounded-md text-sm whitespace-pre-wrap ${
                syncStatus.includes('✗') || syncStatus.includes('Error')
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800' 
                  : syncStatus.includes('✓')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
              }`}>
                <div className="flex items-center gap-2">
                  {syncing && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                  )}
                  <span className="font-medium">{syncStatus}</span>
                </div>
              </div>
              
              {syncStage && syncStage !== 'completed' && syncStage !== 'error' && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Current stage:</span>{' '}
                  <span className="font-medium capitalize text-blue-600 dark:text-blue-400">{syncStage}</span>
                </div>
              )}
              
              {syncMessages.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide sticky top-0 bg-gray-50 dark:bg-gray-900 pb-2">
                    Recent Activity ({syncMessages.length})
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                    {syncMessages.map((msg, idx) => (
                      <div key={idx} className="break-words">{msg}</div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
              
              {syncing && syncMessages.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Waiting for sync activity...
                </div>
              )}
            </div>
          )}
          {credentialsSaved && !syncStatus && (
            <p className="text-sm text-green-600 dark:text-green-400">✓ Credentials saved. You can now sync your data.</p>
          )}
        </form>
      </div>

      {/* Sync Information */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          About Data Syncing
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p>
            Data syncing downloads the latest data from Garmin Connect since your last sync. 
            This includes all data types: activities, monitoring (steps, heart rate), sleep, stress, and more.
          </p>
          <p>
            The sync process will:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Download new data from Garmin Connect</li>
            <li>Import it into your local database</li>
            <li>Create summary tables for insights</li>
          </ul>
          <p className="mt-2">
            Sync typically takes a few minutes depending on how much new data is available.
          </p>
        </div>
      </div>
    </main>
  );
}

