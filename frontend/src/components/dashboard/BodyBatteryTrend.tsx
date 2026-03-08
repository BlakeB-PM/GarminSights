import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Battery, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DailyData } from '../../lib/api';

interface BodyBatteryTrendProps {
  latestDaily: DailyData | null;
  trendData: Array<{ date: string; value: number }>;
  loading?: boolean;
}

export function BodyBatteryTrend({ latestDaily, trendData, loading }: BodyBatteryTrendProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Battery className="w-5 h-5 text-accent" />
            Body Battery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-gray-800 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!latestDaily && trendData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Battery className="w-5 h-5 text-accent" />
            Body Battery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No body battery data available</p>
            <p className="text-sm mt-1">Sync your data to see body battery trends</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentValue = latestDaily?.body_battery_high || 0;
  const previousValue = trendData.length > 1 ? trendData[trendData.length - 2]?.value : currentValue;
  const trend = currentValue > previousValue ? 'up' : currentValue < previousValue ? 'down' : 'neutral';

  const chartData = trendData.map((item) => ({
    date: new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: item.value,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Battery className="w-5 h-5 text-accent" />
          Body Battery
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current value */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Today's peak</p>
              <div className="flex items-center gap-2">
                <p className="text-4xl font-bold font-mono text-accent">{currentValue}</p>
                {trend !== 'neutral' && (
                  <div className={`flex items-center gap-1 ${trend === 'up' ? 'text-success' : 'text-danger'}`}>
                    {trend === 'up' ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : (
                      <TrendingDown className="w-5 h-5" />
                    )}
                    <span className="text-sm font-mono">
                      {trend === 'up' ? '+' : ''}
                      {Math.abs(currentValue - previousValue)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {latestDaily?.body_battery_low && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Low</p>
                <p className="text-lg font-mono">{latestDaily.body_battery_low}</p>
              </div>
            )}
          </div>

          {/* Area chart */}
          {chartData.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                  <YAxis stroke="#6b7280" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value}`, 'Body Battery']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fill="url(#batteryGradient)"
                    dot={{ fill: '#0ea5e9', r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
