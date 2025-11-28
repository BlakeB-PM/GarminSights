'use client';

import { useState, useEffect } from 'react';

interface CorrelationResult {
  metric1: string;
  metric2: string;
  correlation: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
  significance: 'high' | 'medium' | 'low';
}

interface CorrelationsData {
  correlations: CorrelationResult[];
  dataPoints: number;
  weeksAnalyzed: number;
}

export default function CorrelationsPage() {
  const [data, setData] = useState<CorrelationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCorrelation, setSelectedCorrelation] = useState<CorrelationResult | null>(null);

  useEffect(() => {
    const fetchCorrelations = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/insights/correlations?weeks=12');
        if (!res.ok) {
          throw new Error('Failed to fetch correlations');
        }
        const correlationsData = await res.json();
        setData(correlationsData);
        if (correlationsData.correlations && correlationsData.correlations.length > 0) {
          setSelectedCorrelation(correlationsData.correlations[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load correlations');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCorrelations();
  }, []);

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong': return 'text-green-600 dark:text-green-400';
      case 'moderate': return 'text-blue-600 dark:text-blue-400';
      case 'weak': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <main className="container mx-auto p-6 md:p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Correlation Analysis</h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Discover relationships between different health and activity metrics
        </p>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading correlations...</p>
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
          {/* Correlation List */}
          {data.correlations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {data.correlations.map((corr, idx) => (
                <div
                  key={idx}
                  className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-blue-500 dark:hover:border-blue-400 transition-all ${
                    selectedCorrelation === corr ? 'ring-2 ring-blue-500 shadow-md' : ''
                  }`}
                  onClick={() => setSelectedCorrelation(corr)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {corr.metric1.replace(/_/g, ' ')} ↔ {corr.metric2.replace(/_/g, ' ')}
                    </h3>
                    <span className={`text-sm font-medium ${getStrengthColor(corr.strength)}`}>
                      {corr.strength.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {corr.correlation > 0 ? '+' : ''}{corr.correlation.toFixed(3)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {corr.direction === 'positive' ? 'Positive' : 'Negative'} correlation
                    {corr.significance === 'high' && ' • High significance'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center mb-6">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                No significant correlations found
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm">
                More data may be needed to identify correlations
              </p>
            </div>
          )}

          {/* Correlation Explanation */}
          {selectedCorrelation && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                About This Correlation
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                A {selectedCorrelation.strength} {selectedCorrelation.direction} correlation of{' '}
                {selectedCorrelation.correlation.toFixed(3)} means that when{' '}
                {selectedCorrelation.metric1.replace(/_/g, ' ')} increases,{' '}
                {selectedCorrelation.metric2.replace(/_/g, ' ')} tends to{' '}
                {selectedCorrelation.direction === 'positive' ? 'increase' : 'decrease'} as well.
                {selectedCorrelation.correlation > 0.7 && ' This is a strong relationship that may be worth investigating further.'}
              </p>
            </div>
          )}

          {data.correlations.length === 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                No correlation data available
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm">
                Sync your Garmin data to see correlations
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

