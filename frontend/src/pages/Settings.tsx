import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CheckCircle, XCircle, RefreshCw, Database, User, Key, Eye, EyeOff } from 'lucide-react';
import { checkAuthStatus, login, logout, syncData, type AuthStatus, type SyncStatus } from '../lib/api';

export function Settings() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Credential inputs
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const status = await checkAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      setAuthStatus({ authenticated: false, error: 'Backend not running. Start the server first.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      // Use entered credentials or fall back to env
      const status = await login(email || undefined, password || undefined);
      setAuthStatus(status);
      if (status.authenticated) {
        setShowCredentialForm(false);
        setPassword(''); // Clear password from memory
      }
    } catch (error) {
      setAuthStatus({ authenticated: false, error: 'Login failed. Check credentials.' });
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

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const status = await syncData(30);
      setSyncStatus(status);
    } catch (error) {
      setSyncStatus({ success: false, error: 'Sync failed', activities_synced: 0, sleep_days_synced: 0, dailies_synced: 0, strength_sets_extracted: 0 });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Header
        title="Settings"
        subtitle="Manage your Garmin connection and data sync"
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
                      </div>
                    </>
                  )}
                </div>
                
                {authStatus?.authenticated ? (
                  <Button variant="secondary" onClick={handleLogout}>
                    Disconnect
                  </Button>
                ) : (
                  <Button 
                    variant="secondary" 
                    onClick={() => setShowCredentialForm(!showCredentialForm)}
                  >
                    {showCredentialForm ? 'Hide' : 'Enter Credentials'}
                  </Button>
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
                  
                  <Button onClick={handleLogin} isLoading={loggingIn} className="w-full">
                    Connect to Garmin
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100">Sync Last 30 Days</p>
                <p className="text-sm text-gray-500">
                  Downloads activities, sleep, and wellness data
                </p>
              </div>
              <Button
                onClick={handleSync}
                isLoading={syncing}
                disabled={!authStatus?.authenticated}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </Button>
            </div>
            
            {syncStatus && (
              <div className={`p-4 rounded-lg border ${
                syncStatus.success
                  ? 'bg-success/10 border-success/30'
                  : 'bg-danger/10 border-danger/30'
              }`}>
                {syncStatus.success ? (
                  <div className="space-y-2">
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
                  </div>
                ) : (
                  <p className="text-danger">{syncStatus.error || 'Sync failed'}</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Coach Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-accent" />
            AI Coach Configuration
          </CardTitle>
          <CardDescription>
            Configure your Anthropic API key to enable the AI Coach
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Anthropic API Key
              </label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Get your API key from{' '}
                <a 
                  href="https://console.anthropic.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>
            
            <div className="p-3 bg-background rounded-lg border border-card-border">
              <p className="text-sm text-gray-400">
                <strong className="text-gray-300">Note:</strong> To persist the API key, add it to your{' '}
                <code className="text-accent">backend/.env</code> file:
              </p>
              <pre className="mt-2 text-xs text-accent bg-card p-2 rounded overflow-x-auto">
                ANTHROPIC_API_KEY=sk-ant-...
              </pre>
            </div>
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

