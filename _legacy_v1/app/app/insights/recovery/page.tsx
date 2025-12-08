'use client';

import { useState, useEffect } from 'react';
import RecoveryScore from '../../components/insights/RecoveryScore';

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
    elevatedRHR: boolean;
    poorSleep: boolean;
    highStress: boolean;
    lowBodyBattery: boolean;
    excessiveActivity: boolean;
    overallRisk: 'low' | 'medium' | 'high';
  } | null;
  trend: {
    trend: 'improving' | 'declining' | 'stable';
    change: number;
    currentScore: number;
  } | null;
}

export default function RecoveryPage() {
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecovery = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/insights/recovery?days=7');
        if (!res.ok) {
          throw new Error('Failed to fetch recovery data');
        }
        const recoveryData = await res.json();
        setData(recoveryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recovery data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecovery();
  }, []);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
      case 'low': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  return (
    <main className="container mx-auto p-6 md:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Recovery Insights</h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Track your recovery score and identify overtraining indicators
        </p>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading recovery data...</p>
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
          {/* Recovery Score */}
          {data.recoveryScore && (
            <div className="mb-6">
              <RecoveryScore {...data.recoveryScore} />
            </div>
          )}

          {/* Recovery Trend */}
          {data.trend && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Recovery Trend
              </h2>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {data.trend.currentScore}
                </div>
                <div>
                  <div className={`text-lg font-medium ${
                    data.trend.trend === 'improving' ? 'text-green-600 dark:text-green-400' :
                    data.trend.trend === 'declining' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {data.trend.trend === 'improving' ? '↑ Improving' :
                     data.trend.trend === 'declining' ? '↓ Declining' :
                     '→ Stable'}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Change: {data.trend.change > 0 ? '+' : ''}{data.trend.change.toFixed(1)} points
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Overtraining Indicators */}
          {data.overtraining && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Overtraining Indicators
              </h2>
              <div className={`p-4 rounded-lg mb-4 ${getRiskColor(data.overtraining.overallRisk)}`}>
                <div className="font-semibold mb-2">Overall Risk: {data.overtraining.overallRisk.toUpperCase()}</div>
                <div className="text-sm">
                  {data.overtraining.overallRisk === 'high' && 'Consider taking rest days and reducing training load.'}
                  {data.overtraining.overallRisk === 'medium' && 'Monitor your recovery closely and ensure adequate rest.'}
                  {data.overtraining.overallRisk === 'low' && 'Your recovery indicators look good!'}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.overtraining.elevatedRHR && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">Elevated Resting HR</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">Your resting heart rate is higher than baseline</div>
                  </div>
                )}
                {data.overtraining.poorSleep && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">Poor Sleep</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">Average sleep is below recommended levels</div>
                  </div>
                )}
                {data.overtraining.highStress && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">High Stress</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">Stress levels are elevated</div>
                  </div>
                )}
                {data.overtraining.lowBodyBattery && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">Low Body Battery</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">Body battery levels are low</div>
                  </div>
                )}
                {data.overtraining.excessiveActivity && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">Excessive Activity</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">Very high step counts detected</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!data.recoveryScore && !data.overtraining && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                No recovery data available
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm">
                Sync your Garmin data to see recovery insights
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

