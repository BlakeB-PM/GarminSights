import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TimeFrameSelector } from './TimeFrameSelector';
import { getMuscleBalance, type MuscleBalance } from '../../lib/api';

type PresetDays = 7 | 30 | 90 | 180 | 365;
type Metric = 'total' | 'avgPerWeek';

export function MuscleBalanceRadar() {
  const [days, setDays] = useState<PresetDays>(30);
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [metric, setMetric] = useState<Metric>('total');
  const [data, setData] = useState<MuscleBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMuscleBalance(days, primaryOnly)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load muscle balance');
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, primaryOnly]);

  const totalSets = data.reduce((sum, d) => sum + d.sets, 0);
  const hasData = data.some((d) => d.sets > 0);

  const isAvg = metric === 'avgPerWeek';
  const weeks = days / 7;
  const roundTenths = (n: number) => Math.round(n * 10) / 10;
  const chartData = isAvg
    ? data.map((d) => ({ ...d, sets: roundTenths(d.sets / weeks) }))
    : data;
  const headerValue = isAvg
    ? `Avg: ${roundTenths(totalSets / weeks)} sets/week`
    : `Total: ${totalSets} sets`;
  const unitLabel = isAvg ? 'sets/week' : 'sets';

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <CardTitle>Muscle Training Balance</CardTitle>
            <CardDescription>
              {isAvg
                ? 'Average sets per muscle group per week over the selected period'
                : 'Sets per muscle group over the selected period'}
            </CardDescription>
          </div>
          <div className="text-sm text-gray-400 whitespace-nowrap">{headerValue}</div>
        </div>
        <div className="flex gap-4 items-center flex-wrap">
          <TimeFrameSelector
            mode="presetDays"
            value={days}
            onChange={(v) => setDays(v as PresetDays)}
          />
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">Metric:</span>
            <Button
              size="sm"
              variant={!isAvg ? 'primary' : 'secondary'}
              onClick={() => setMetric('total')}
            >
              Total
            </Button>
            <Button
              size="sm"
              variant={isAvg ? 'primary' : 'secondary'}
              onClick={() => setMetric('avgPerWeek')}
            >
              Avg / week
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">Count:</span>
            <Button
              size="sm"
              variant={primaryOnly ? 'primary' : 'secondary'}
              onClick={() => setPrimaryOnly(true)}
            >
              Primary only
            </Button>
            <Button
              size="sm"
              variant={!primaryOnly ? 'primary' : 'secondary'}
              onClick={() => setPrimaryOnly(false)}
            >
              Primary + Secondary
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
            {error}
          </div>
        )}
        <div className="h-72 sm:h-80 md:h-96">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="75%">
                <PolarGrid stroke="#1e1e2e" />
                <PolarAngleAxis
                  dataKey="muscle_group"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <PolarRadiusAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  stroke="#1e1e2e"
                  angle={90}
                />
                <Radar
                  name={isAvg ? 'Avg sets/week' : 'Sets'}
                  dataKey="sets"
                  stroke="#0ea5e9"
                  fill="#0ea5e9"
                  fillOpacity={0.35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [
                    `${value} ${unitLabel}`,
                    isAvg ? 'Avg / week' : 'Sets',
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              No strength sets in this period
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
