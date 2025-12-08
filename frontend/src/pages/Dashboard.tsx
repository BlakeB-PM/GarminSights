import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { StatCard } from '../components/dashboard/StatCard';
import { ActivityHeatmap } from '../components/dashboard/ActivityHeatmap';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Moon, Battery, Footprints, Activity, TrendingUp } from 'lucide-react';
import {
  getDashboardSummary,
  getActivityHeatmap,
  getRecoveryStatus,
  type DashboardSummary,
  type ActivityHeatmapDay,
  type RecoveryStatus,
} from '../lib/api';
import { formatNumber } from '../lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapDay[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, heatmapData, recoveryData] = await Promise.all([
          getDashboardSummary().catch(() => null),
          getActivityHeatmap(30).catch(() => []),
          getRecoveryStatus().catch(() => null),
        ]);
        setSummary(summaryData);
        setHeatmap(heatmapData || []);
        setRecovery(recoveryData);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Could not connect to backend. Make sure the server is running.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-danger mb-2">{error}</p>
          <p className="text-gray-500 text-sm">Go to Settings to connect to Garmin and sync data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Header
        title="Dashboard"
        subtitle="Your fitness overview at a glance"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Sleep Score"
          value={summary?.last_sleep_score ?? '—'}
          subtitle="Last night"
          icon={<Moon className="w-5 h-5 text-accent" />}
          scoreValue={summary?.last_sleep_score ?? 0}
        />
        
        <StatCard
          title="Body Battery"
          value={summary?.last_body_battery ?? '—'}
          subtitle="Current"
          icon={<Battery className="w-5 h-5 text-accent" />}
          scoreValue={summary?.last_body_battery ?? 0}
        />
        
        <StatCard
          title="Weekly Steps"
          value={formatNumber(summary?.weekly_steps ?? 0)}
          subtitle="Last 7 days"
          icon={<Footprints className="w-5 h-5 text-accent" />}
          trend="up"
          trendValue="+12%"
        />
        
        <StatCard
          title="Weekly Activities"
          value={summary?.weekly_activities ?? 0}
          subtitle="Last 7 days"
          icon={<Activity className="w-5 h-5 text-accent" />}
        />
      </div>

      {/* Recovery Status & Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recovery Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Recovery Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recovery ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold font-mono text-accent">
                      {recovery.recovery_score ?? '—'}
                    </p>
                    <p className="text-sm text-gray-400 capitalize">
                      {recovery.status ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-300">{recovery.message ?? ''}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-card-border">
                  <div>
                    <p className="text-xs text-gray-500">Sleep</p>
                    <p className="text-lg font-mono">{recovery.details?.sleep_score ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Body Battery</p>
                    <p className="text-lg font-mono">{recovery.details?.body_battery ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Stress</p>
                    <p className="text-lg font-mono">{recovery.details?.stress_average ?? '—'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No recovery data available</p>
                <p className="text-sm mt-1">Sync your data to see recovery stats</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Heatmap */}
        <ActivityHeatmap data={heatmap} days={30} />
      </div>

      {/* Sleep Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sleep Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {recovery?.trend && recovery.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={recovery.trend}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="#6b7280" fontSize={12} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sleep_score"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ fill: '#0ea5e9', r: 4 }}
                    name="Sleep Score"
                  />
                  <Line
                    type="monotone"
                    dataKey="body_battery_high"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    name="Body Battery"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>No trend data available. Sync your data to see charts.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

