import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Dumbbell } from 'lucide-react';
import { formatNumber, formatWeightDual } from '../../lib/utils';
import { getKeyLifts, type KeyLiftCard } from '../../lib/api';
import { useEffect, useState } from 'react';

interface StrengthSummaryProps {
  loading?: boolean;
}

export function StrengthSummary({ loading: externalLoading }: StrengthSummaryProps) {
  const [keyLifts, setKeyLifts] = useState<KeyLiftCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadKeyLifts() {
      try {
        const data = await getKeyLifts();
        setKeyLifts(data.slice(0, 5)); // Top 5 lifts
      } catch (err) {
        console.error('Failed to load key lifts:', err);
      } finally {
        setLoading(false);
      }
    }
    loadKeyLifts();
  }, []);

  if (externalLoading || loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-accent" />
            Strength Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (keyLifts.length === 0) {
    return null; // Don't show if no strength data
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-accent" />
          Strength Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {keyLifts.map((lift) => (
            <div
              key={lift.exercise_name}
              className="p-3 rounded-lg bg-card-border/20 border border-card-border"
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-gray-200">{lift.exercise_name}</h4>
                {lift.status === 'progress' && (
                  <span className="text-xs px-2 py-1 rounded bg-success/20 text-success">
                    Progress
                  </span>
                )}
                {lift.status === 'plateau' && (
                  <span className="text-xs px-2 py-1 rounded bg-warning/20 text-warning">
                    Plateau
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                {lift.best_recent_weight && lift.best_recent_reps && (
                  <div>
                    <p className="text-xs text-gray-500">Best Recent</p>
                    <p className="font-mono">
                      {formatWeightDual(lift.best_recent_weight)} × {lift.best_recent_reps}
                    </p>
                  </div>
                )}
                {lift.estimated_1rm && (
                  <div>
                    <p className="text-xs text-gray-500">Est. 1RM</p>
                    <p className="font-mono">{formatWeightDual(lift.estimated_1rm)}</p>
                  </div>
                )}
                {lift.four_week_trend_percent !== null && (
                  <div>
                    <p className="text-xs text-gray-500">4-Week Trend</p>
                    <p className={`font-mono ${lift.four_week_trend_percent > 0 ? 'text-success' : lift.four_week_trend_percent < 0 ? 'text-danger' : ''}`}>
                      {lift.four_week_trend_percent > 0 ? '+' : ''}
                      {lift.four_week_trend_percent.toFixed(1)}%
                    </p>
                  </div>
                )}
                {lift.days_since_last !== null && (
                  <div>
                    <p className="text-xs text-gray-500">Days Since</p>
                    <p className="font-mono">{lift.days_since_last}d</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

