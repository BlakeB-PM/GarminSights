import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Moon } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { calculateSleepStagePercentages, formatDuration } from '../../lib/utils';
import type { SleepData } from '../../lib/api';

interface SleepStagesProps {
  latestSleep: SleepData | null;
  sleepData: SleepData[];
  loading?: boolean;
}

const STAGE_COLORS = {
  deep: '#3b82f6', // blue
  rem: '#8b5cf6', // purple
  light: '#0ea5e9', // light blue
  awake: '#ef4444', // red
};

export function SleepStages({ latestSleep, sleepData, loading }: SleepStagesProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-accent" />
            Sleep Stages
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

  if (!latestSleep) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-accent" />
            Sleep Stages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No sleep data available</p>
            <p className="text-sm mt-1">Sync your data to see sleep stages</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const percentages = calculateSleepStagePercentages(latestSleep);
  const totalSeconds = latestSleep.total_sleep_seconds ?? 0;
  const totalHours = totalSeconds / 3600;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const sleepDateLabel =
    latestSleep.date === todayStr || latestSleep.date === yesterdayStr
      ? 'Last night'
      : new Date(latestSleep.date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

  // Prepare pie chart data
  const pieData = [
    { name: 'Deep', value: percentages.deep, seconds: latestSleep.deep_sleep_seconds || 0 },
    { name: 'REM', value: percentages.rem, seconds: latestSleep.rem_sleep_seconds || 0 },
    { name: 'Light', value: percentages.light, seconds: latestSleep.light_sleep_seconds || 0 },
    { name: 'Awake', value: percentages.awake, seconds: latestSleep.awake_seconds || 0 },
  ].filter(item => item.value > 0);

  // Prepare 7-day trend data
  const trendData = sleepData.slice(0, 7).reverse().map((sleep) => {
    const pct = calculateSleepStagePercentages(sleep);
    return {
      date: new Date(sleep.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      deep: (sleep.deep_sleep_seconds || 0) / 3600,
      rem: (sleep.rem_sleep_seconds || 0) / 3600,
      light: (sleep.light_sleep_seconds || 0) / 3600,
      awake: (sleep.awake_seconds || 0) / 3600,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-accent" />
          Sleep Stages
          <span className="text-xs font-normal text-gray-500 ml-1">({sleepDateLabel})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Last Night Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total Sleep</p>
              <p className="text-2xl font-bold font-mono">{totalHours.toFixed(1)}h</p>
            </div>
            {latestSleep.sleep_score && (
              <div>
                <p className="text-xs text-gray-500">Sleep Score</p>
                <p className="text-2xl font-bold font-mono">{latestSleep.sleep_score}</p>
              </div>
            )}
          </div>

          {/* Pie Chart */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.name === 'Deep'
                          ? STAGE_COLORS.deep
                          : entry.name === 'REM'
                          ? STAGE_COLORS.rem
                          : entry.name === 'Light'
                          ? STAGE_COLORS.light
                          : STAGE_COLORS.awake
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    const entry = pieData.find((e) => e.name === name);
                    return [`${value}% (${formatDuration(entry?.seconds || 0)})`, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 7-Day Trend */}
          {trendData.length > 0 && (
            <div className="h-48">
              <p className="text-sm text-gray-400 mb-2">7-Day Trend (hours)</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    fontSize={10}
                  />
                  <YAxis stroke="#6b7280" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="deep" stackId="a" fill={STAGE_COLORS.deep} name="Deep" />
                  <Bar dataKey="rem" stackId="a" fill={STAGE_COLORS.rem} name="REM" />
                  <Bar dataKey="light" stackId="a" fill={STAGE_COLORS.light} name="Light" />
                  <Bar dataKey="awake" stackId="a" fill={STAGE_COLORS.awake} name="Awake" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

