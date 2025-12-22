import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getStressCategoryColor, formatDuration } from '../../lib/utils';
import type { StressDistribution } from '../../lib/api';

interface StressDistributionProps {
  data: StressDistribution | null;
  loading?: boolean;
}

export function StressDistribution({ data, loading }: StressDistributionProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-accent" />
            Stress Distribution
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

  if (!data || data.total_seconds === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-accent" />
            Stress Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No stress data available</p>
            <p className="text-sm mt-1">Sync your data to see stress distribution</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare pie chart data
  const pieData = [
    {
      name: 'Low',
      value: data.low_stress_seconds,
      seconds: data.low_stress_seconds,
      color: getStressCategoryColor('low'),
    },
    {
      name: 'Medium',
      value: data.medium_stress_seconds,
      seconds: data.medium_stress_seconds,
      color: getStressCategoryColor('medium'),
    },
    {
      name: 'High',
      value: data.high_stress_seconds,
      seconds: data.high_stress_seconds,
      color: getStressCategoryColor('high'),
    },
    {
      name: 'Rest',
      value: data.rest_stress_seconds,
      seconds: data.rest_stress_seconds,
      color: getStressCategoryColor('rest'),
    },
    {
      name: 'Activity',
      value: data.activity_stress_seconds,
      seconds: data.activity_stress_seconds,
      color: getStressCategoryColor('activity'),
    },
  ].filter((item) => item.value > 0);

  const totalHours = data.total_seconds / 3600;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent" />
          Stress Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Average Stress</p>
              <p className="text-2xl font-bold font-mono">
                {data.avg_stress !== null ? data.avg_stress.toFixed(1) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Time</p>
              <p className="text-2xl font-bold font-mono">{totalHours.toFixed(1)}h</p>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatDuration(value)}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {pieData.map((item) => {
              const percentage = (item.seconds / data.total_seconds) * 100;
              return (
                <div key={item.name} className="flex items-center justify-between p-2 rounded bg-card-border/20">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-400">{item.name}</span>
                  </div>
                  <span className="font-mono">{percentage.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

