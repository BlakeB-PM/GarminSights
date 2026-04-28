import { useState, useEffect, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CheckCircle, XCircle, RefreshCw, Database, User, Key, Eye, EyeOff } from 'lucide-react';
import { checkAuthStatus, login, logout, syncData, type AuthStatus, type SyncStatus } from '../lib/api';

// Delays between auto-retries when the server is unreachable (cold start).
// Total coverage: 10s + 20s + 30s = 60s after the initial ~7s retry window.
const COLD_START_RETRY_DELAYS = [10_000, 20_000, 30_000];

export function Settings({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Credential inputs
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // MFA step 2: shown when login returns needs_mfa
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [selectedDays, setSelectedDays] = useState<number>(30);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coldStartAttemptRef = useRef(0);

  const clearRetryTimers = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    setRetryCountdown(null);
  };

  useEffect(() => {
    checkAuth();
    return clearRetryTimers;
  }, []);

  const scheduleAutoRetry = (delayMs: number) => {
    clearRetryTimers();
    let remaining = Math.round(delayMs / 1000);
    setRetryCountdown(remaining);
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRetryCountdown(remaining > 0 ? remaining : null);
      if (remaining <= 0 && countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }, 1000);
    retryTimerRef.current = setTimeout(() => checkAuth(true), delayMs);
  };

  const checkAuth = async (isAutoRetry = false) => {
    if (!isAutoRetry) {
      coldStartAttemptRef.current = 0;
      clearRetryTimers();
    }
    setLoading(true);
    try {
      const status = await checkAuthStatus();
      setAuthStatus(status);
      coldStartAttemptRef.current = 0;
      clearRetryTimers();
    } catch (error) {
      setAuthStatus({
        authenticated: false,
        error: 'Could not reach the server. If it was idle it may still be starting — please wait a few seconds and retry.',
      });
      // Auto-retry to survive Fly.io cold starts (machine can take 15-45s to start)
      const attempt = coldStartAttemptRef.current;
      if (attempt < COLD_START_RETRY_DELAYS.length) {
        coldStartAttemptRef.current += 1;
        scheduleAutoRetry(COLD_START_RETRY_DELAYS[attempt]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      const status = await login({
        email: email && email.trim() ? email.trim() : undefined,
        password: password && password.trim() ? password.trim() : undefined,
        mfa_code: mfaCode && mfaCode.trim() ? mfaCode.trim() : undefined,
        mfa_token: mfaToken ?? undefined,
      });
      setAuthStatus(status);
      if (status.authenticated) {
        setShowCredentialForm(false);
        setPassword('');
        setEmail('');
        setMfaToken(null);
        setMfaCode('');
      } else if (status.needs_mfa && status.mfa_token) {
        setMfaToken(status.mfa_token);
        setMfaCode('');
        setShowCredentialForm(true);  // Expand form so user can enter MFA code
      }
    } catch (error: any) {
      setAuthStatus({ 
        authenticated: false, 
        error: error?.message || 'Login failed. Check credentials.' 
      });
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      const status = await logout();
      setAuthStatus(status);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSync = async (daysBack?: number) => {
    const days = daysBack ?? selectedDays;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const status = await syncData(days);
      setSyncStatus(status);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Network error';
      setSyncStatus({ success: false, error: msg, activities_synced: 0, sleep_days_synced: 0, dailies_synced: 0, strength_sets_extracted: 0 });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <Header
        title="Settings"
        subtitle="Manage your Garmin connection and data sync"
        onMenuToggle={onMenuToggle}
      />

      {/* Auth Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-accent" />
            Garmin Connect
          </CardTitle>
          <CardDescription>
            Connect to your Garmin account to sync fitness data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent" />
              <span className="text-gray-400">Checking connection...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {authStatus?.authenticated ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-success" />
                      <div>
                        <p className="text-gray-100">Connected</p>
                        <p className="text-sm text-gray-500">Logged in as {authStatus.username}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-danger" />
                      <div>
                        <p className="text-gray-100">Not Connected</p>
                        <p className="text-sm text-gray-500">
                          {authStatus?.error || 'Login to sync data'}
                        </p>
                        {retryCountdown !== null && (
                          <p className="text-xs text-accent mt-1">
                            Retrying in {retryCountdown}s…
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                
                {authStatus?.authenticated ? (
                  <Button variant="secondary" onClick={handleLogout}>
                    Disconnect
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    {authStatus?.error && (
                      <Button
                        variant="secondary"
                        onClick={() => checkAuth()}
                        disabled={loading || retryCountdown !== null}
                        title="Retry connection"
                      >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowCredentialForm(!showCredentialForm);
                        if (showCredentialForm) {
                          setMfaToken(null);
                          setMfaCode('');
                        }
                      }}
                    >
                      {showCredentialForm ? 'Hide' : 'Enter Credentials'}
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Credential Form */}
              {!authStatus?.authenticated && showCredentialForm && (
                <div className="space-y-4 p-4 bg-background rounded-lg border border-card-border">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Garmin Email
                    </label>
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        disabled={!!mfaToken}
                      />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Garmin Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Verification Code {mfaToken && '(required)'}
                    </label>
                    <Input
                      type="text"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="Enter code from email (if MFA enabled)"
                      maxLength={8}
                      autoComplete="one-time-code"
                      className="font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {mfaToken
                        ? 'Enter the 6-digit code sent to your email'
                        : 'If you have MFA enabled, enter the code and click Connect'}
                    </p>
                  </div>
                  
                  <Button onClick={handleLogin} isLoading={loggingIn} className="w-full">
                    {mfaToken ? 'Verify & Connect' : mfaCode ? 'Connect with Code' : 'Connect to Garmin'}
                  </Button>
                  
                  <p className="text-xs text-gray-500 text-center">
                    Your credentials are sent directly to Garmin and are not stored on any server.
                  </p>
                </div>
              )}
              
              {/* Quick connect option */}
              {!authStatus?.authenticated && !showCredentialForm && (
                <div className="p-4 bg-background rounded-lg border border-card-border">
                  <p className="text-sm text-gray-400 mb-3">
                    <Key className="w-4 h-4 inline mr-2" />
                    You can also set credentials in <code className="text-accent">backend/.env</code> file
                    and click below to use them:
                  </p>
                  <Button onClick={handleLogin} isLoading={loggingIn} variant="secondary" className="w-full">
                    Connect with .env Credentials
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Data Sync
          </CardTitle>
          <CardDescription>
            Sync your activities, sleep, and daily metrics from Garmin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-gray-100 mb-3">Select Time Range</p>
              <p className="text-sm text-gray-500 mb-4">
                Choose how far back to sync your activities, sleep, and wellness data
              </p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  onClick={() => setSelectedDays(30)}
                  disabled={syncing || !authStatus?.authenticated}
                  className={`p-3 rounded-lg border transition-all ${
                    selectedDays === 30
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-card-border text-gray-400 hover:border-accent/50'
                  } ${syncing || !authStatus?.authenticated ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <p className="font-medium">30 Days</p>
                  <p className="text-xs mt-1">Last month</p>
                </button>
                <button
                  onClick={() => setSelectedDays(180)}
                  disabled={syncing || !authStatus?.authenticated}
                  className={`p-3 rounded-lg border transition-all ${
                    selectedDays === 180
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-card-border text-gray-400 hover:border-accent/50'
                  } ${syncing || !authStatus?.authenticated ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <p className="font-medium">6 Months</p>
                  <p className="text-xs mt-1">Last half year</p>
                </button>
                <button
                  onClick={() => setSelectedDays(365)}
                  disabled={syncing || !authStatus?.authenticated}
                  className={`p-3 rounded-lg border transition-all ${
                    selectedDays === 365
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-card-border text-gray-400 hover:border-accent/50'
                  } ${syncing || !authStatus?.authenticated ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <p className="font-medium">1 Year</p>
                  <p className="text-xs mt-1">Full year</p>
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-2 border-t border-card-border">
              <div>
                <p className="text-gray-100">
                  Sync Last {selectedDays === 30 ? '30 Days' : selectedDays === 180 ? '6 Months' : '1 Year'}
                </p>
                <p className="text-sm text-gray-500">
                  {selectedDays === 30 && 'Downloads recent activities, sleep, and wellness data'}
                  {selectedDays === 180 && 'Downloads activities, sleep, and wellness data from the past 6 months'}
                  {selectedDays === 365 && 'Downloads activities, sleep, and wellness data from the past year'}
                </p>
              </div>
              <Button
                onClick={() => handleSync()}
                isLoading={syncing}
                disabled={!authStatus?.authenticated}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </Button>
            </div>
            
            {syncStatus && (
              <div className={`p-4 rounded-lg border ${
                syncStatus.success && (syncStatus.activities_synced > 0 || syncStatus.sleep_days_synced > 0 || syncStatus.dailies_synced > 0)
                  ? 'bg-success/10 border-success/30'
                  : syncStatus.success
                  ? 'bg-warning/10 border-warning/30'
                  : 'bg-danger/10 border-danger/30'
              }`}>
                {syncStatus.success ? (
                  <div className="space-y-3">
                    {syncStatus.activities_synced === 0 && syncStatus.sleep_days_synced === 0 && syncStatus.dailies_synced === 0 ? (
                      <>
                        <p className="text-warning font-medium">Sync Complete - No New Data</p>
                        {syncStatus.warnings && syncStatus.warnings.length > 0 ? (
                          <div className="space-y-1">
                            {syncStatus.warnings.map((warning, idx) => (
                              <p key={idx} className="text-sm text-warning">{warning}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">
                            All data appears to be up to date for the selected time range.
                          </p>
                        )}
                        {syncStatus.error && (
                          <p className="text-sm text-danger mt-2">Error: {syncStatus.error}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-success font-medium">Sync Complete!</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-400">Activities</p>
                            <p className="text-gray-100 font-mono">{syncStatus.activities_synced}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Strength Sets</p>
                            <p className="text-gray-100 font-mono">{syncStatus.strength_sets_extracted}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Sleep Days</p>
                            <p className="text-gray-100 font-mono">{syncStatus.sleep_days_synced}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Daily Metrics</p>
                            <p className="text-gray-100 font-mono">{syncStatus.dailies_synced}</p>
                          </div>
                        </div>
                        {syncStatus.warnings && syncStatus.warnings.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-warning/20">
                            <p className="text-xs text-warning font-medium mb-1">Warnings:</p>
                            {syncStatus.warnings.map((warning, idx) => (
                              <p key={idx} className="text-xs text-warning">{warning}</p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-danger font-medium">Sync Failed</p>
                    <p className="text-sm text-danger">{syncStatus.error || 'Unknown error occurred'}</p>
                    {syncStatus.details && Object.keys(syncStatus.details).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-danger/20">
                        <p className="text-xs text-gray-400 mb-1">Details:</p>
                        <pre className="text-xs text-gray-500 bg-background p-2 rounded overflow-x-auto">
                          {JSON.stringify(syncStatus.details, null, 2)}
                        </pre>
                      </div>
                    )}
                    {syncStatus.warnings && syncStatus.warnings.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-warning font-medium mb-1">Additional warnings:</p>
                        {syncStatus.warnings.map((warning, idx) => (
                          <p key={idx} className="text-xs text-warning">{warning}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About GarminSights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Version 2.0.0</p>
            <p>A personal fitness analytics dashboard powered by your Garmin data.</p>
            <p className="pt-2">
              Built with FastAPI, React, and Claude AI.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

