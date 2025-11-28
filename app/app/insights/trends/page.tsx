'use client';

import { useState, useEffect } from 'react';
import TrendCard from '../../components/insights/TrendCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendAnalysis {
  metric: string;
  displayName: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  significance: 'high' | 'medium' | 'low';
}

interface TrendsData {
  trends: TrendAnalysis[];
  data: any[];
  metrics: string[];
  weeksAnalyzed: number;
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  useEffect(() => {
    const fetchTrends = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/insights/trends?weeks=8');
        if (!res.ok) {
          throw new Error('Failed to fetch trends');
        }
        const trendsData = await res.json();
        setData(trendsData);
        if (trendsData.data && trendsData.data.length > 0) {
          setSelectedMetric(trendsData.metrics[0] || '');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trends');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTrends();
  }, []);

  const formatValue = (metric: string) => (value: number) => {
    if (metric.includes('hours') || metric.includes('sleep')) {
      return `${value.toFixed(1)}h`;
    }
    if (metric.includes('percent') || metric.includes('stress')) {
      return `${value.toFixed(0)}%`;
    }
    if (metric.includes('steps')) {
      return value.toLocaleString();
    }
    return value.toFixed(1);
  };

  return (
    <main className="container mx-auto p-6 md:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Trend Analysis</h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Week-over-week trends across your health and activity metrics
        </p>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading trends...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Trend Cards */}
          {data.trends.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {data.trends.map((trend) => (
                <TrendCard
                  key={trend.metric}
                  title={trend.displayName}
                  current={trend.current}
                  previous={trend.previous}
                  change={trend.change}
                  changePercent={trend.changePercent}
                  trend={trend.trend}
                  significance={trend.significance}
                  formatValue={formatValue(trend.metric)}
                />
              ))}
            </div>
          )}

          {/* Chart */}
          {data.data && data.data.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700">
              <div className="mb-4">
                <label htmlFor="metric-select" className="block text-sm font-medium mb-2">
                  Select Metric to Chart
                </label>
                <select
                  id="metric-select"
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {data.metrics.map((metric) => (
                    <option key={metric} value={metric}>
                      {metric.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="week_start_date" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey={selectedMetric} 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name={selectedMetric.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.trends.length === 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                No trend data available
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm">
                Sync your Garmin data to see trends
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

