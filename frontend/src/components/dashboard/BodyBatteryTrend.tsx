import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Battery, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDailyTrend, type DailyData } from '../../lib/api';
import { useEffect, useState } from 'react';

interface BodyBatteryTrendProps {
  latestDaily: DailyData | null;
  loading?: boolean;
  startDate?: string;
  endDate?: string;
}

export function BodyBatteryTrend({ latestDaily, loading, startDate, endDate }: BodyBatteryTrendProps) {
  const [trendData, setTrendData] = useState<Array<{ date: string; value: number }>>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    async function loadTrend() {
      if (!startDate || !endDate) return;
      
      setTrendLoading(true);
      try {
        const data = await getDailyTrend('body_battery_high', undefined, startDate, endDate);
        setTrendData(data);
      } catch (err) {
        console.error('Failed to load body battery trend:', err);
      } finally {
        setTrendLoading(false);
      }
    }
    loadTrend();
  }, [startDate, endDate]);

  if (loading || trendLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Battery className="w-5 h-5 text-accent" />
            Body Battery
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

  // Format chart data
  const chartData = trendData.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
          {/* Current Value */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Current</p>
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

          {/* Trend Chart */}
          {chartData.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    fontSize={10}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={10}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0ea5e9"
                    fill="#0ea5e9"
                    fillOpacity={0.2}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ fill: '#0ea5e9', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

