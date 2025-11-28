'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import TrendCard from './components/insights/TrendCard';
import RecoveryScore from './components/insights/RecoveryScore';
import DataFreshnessIndicator from './components/insights/DataFreshnessIndicator';

interface Insight {
  type: string;
  message: string;
  trend: 'up' | 'down' | 'stable';
  value: number;
  change?: number;
}

interface SummaryData {
  insights: Insight[];
  metrics: {
    avgSteps: number;
    avgSleepHours: string;
    avgStress: string;
    avgRHR: number | null;
  };
  dataRange: {
    start: string;
    end: string;
  };
}

interface RecoveryData {
  recoveryScore: {
    score: number;
    level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    factors: {
      sleep: { score: number; status: string };
      stress: { score: number; status: string };
      heartRate: { score: number; status: string };
      activity: { score: number; status: string };
    };
    recommendations: string[];
  } | null;
  overtraining: {
    overallRisk: 'low' | 'medium' | 'high';
  } | null;
}

interface DailyDataPoint {
  day: string;
  steps: number;
  sleep_hours: number;
  stress: number;
  rhr: number;
  intensity_time: number;
}

export default function Home() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recovery, setRecovery] = useState<RecoveryData | null>(null);
  const [dailyData, setDailyData] = useState<DailyDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [summaryRes, recoveryRes, dailyRes] = await Promise.all([
          fetch('/api/insights/summary'),
          fetch('/api/insights/recovery'),
          fetch('/api/daily-data?limit=14'),
        ]);
        
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setSummary(summaryData);
        } else if (summaryRes.status === 404) {
          setError('No data available. Please sync your Garmin data first.');
        }
        
        if (recoveryRes.ok) {
          const recoveryData = await recoveryRes.json();
          setRecovery(recoveryData);
        }
        
        if (dailyRes.ok) {
          const dailyDataJson = await dailyRes.json();
          if (dailyDataJson.data) {
            const formatted = dailyDataJson.data.map((d: any) => ({
              day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              steps: d.steps || 0,
              sleep_hours: d.sleep_avg ? parseFloat(d.sleep_avg.split(':')[0]) + parseFloat(d.sleep_avg.split(':')[1]) / 60 : 0,
              stress: d.stress_avg || 0,
              rhr: d.rhr_avg || 0,
              intensity_time: d.intensity_time ? parseFloat(d.intensity_time.split(':')[0]) + parseFloat(d.intensity_time.split(':')[1]) / 60 : 0,
            }));
            setDailyData(formatted.reverse());
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load insights');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-yellow-800 dark:text-yellow-200 mb-2">No Data Available</h2>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">{error}</p>
          <a
            href="/settings"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Settings to Sync Data
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {summary?.dataRange && `${new Date(summary.dataRange.start).toLocaleDateString()} - ${new Date(summary.dataRange.end).toLocaleDateString()}`}
        </p>
      </div>

      {/* Key Metrics Row */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Daily Steps</span>
              <span className="text-2xl">👣</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {summary.metrics.avgSteps.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">7-day average</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Sleep</span>
              <span className="text-2xl">😴</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {summary.metrics.avgSleepHours}h
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">7-day average</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Stress</span>
              <span className="text-2xl">🧘</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {summary.metrics.avgStress}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">7-day average</div>
          </div>

          {summary.metrics.avgRHR && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Resting HR</span>
                <span className="text-2xl">❤️</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {summary.metrics.avgRHR}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">bpm average</div>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Steps Chart */}
        {dailyData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Steps (14 days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorSteps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="steps" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorSteps)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sleep Chart */}
        {dailyData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Sleep Hours (14 days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="sleep_hours" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recovery and Insights Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recovery Score */}
        {recovery && recovery.recoveryScore && (
          <div className="lg:col-span-1">
            <RecoveryScore {...recovery.recoveryScore} />
          </div>
        )}

        {/* Insights */}
        {summary && summary.insights.length > 0 && (
          <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${recovery?.recoveryScore ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Insights</h3>
            <div className="space-y-3">
              {summary.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-l-4 ${
                    insight.trend === 'up'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                      : insight.trend === 'down'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">
                      {insight.trend === 'up' ? '📈' : insight.trend === 'down' ? '📉' : '➡️'}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {insight.message}
                      </p>
                      {insight.change !== undefined && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Change: {insight.change > 0 ? '+' : ''}{insight.change.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stress and HR Chart */}
      {dailyData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Stress & Heart Rate Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="stress" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4 }}
                name="Stress"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="rhr" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 4 }}
                name="Resting HR"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
