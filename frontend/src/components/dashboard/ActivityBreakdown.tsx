import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Activity } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getActivityTypeName, formatNumber, formatDurationMinutes } from '../../lib/utils';
import type { ActivityBreakdown } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ActivityBreakdownProps {
  data: ActivityBreakdown | null;
  loading?: boolean;
}

const COLORS = {
  strength_training: '#ff6b35',
  running: '#4a90e2',
  cycling: '#4a90e2',
  swimming: '#4a90e2',
  walking: '#9ca3af',
  hiking: '#9ca3af',
  yoga: '#9ca3af',
  other: '#6b7280',
};

function getColor(activityType: string): string {
  return COLORS[activityType as keyof typeof COLORS] || COLORS.other;
}

export function ActivityBreakdown({ data, loading }: ActivityBreakdownProps) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Activity Breakdown
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

  if (!data || !data.breakdown || data.breakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Activity Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No activity data available</p>
            <p className="text-sm mt-1">Sync your data to see activity breakdown</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare pie chart data
  const pieData = data.breakdown.map((item) => ({
    name: getActivityTypeName(item.activity_type),
    value: item.total_minutes,
    type: item.activity_type,
  }));

  // Prepare bar chart data
  const barData = data.breakdown.map((item) => ({
    name: getActivityTypeName(item.activity_type),
    minutes: Math.round(item.total_minutes),
    sessions: item.count,
    calories: item.total_calories,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Activity Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div>
              <p className="text-xs text-gray-500">Total Sessions</p>
              <p className="text-xl md:text-2xl font-bold font-mono">{formatNumber(data.totals.sessions)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Time</p>
              <p className="text-xl md:text-2xl font-bold font-mono">{formatDurationMinutes(data.totals.minutes)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Calories</p>
              <p className="text-xl md:text-2xl font-bold font-mono">{formatNumber(data.totals.calories)}</p>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="h-48 sm:h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={isMobile ? false : true}
                  label={isMobile ? false : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={isMobile ? 60 : 80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColor(entry.type)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatDurationMinutes(value)}
                />
                {isMobile && <Legend />}
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div className="h-52 sm:h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  fontSize={isMobile ? 10 : 12}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis stroke="#6b7280" fontSize={isMobile ? 10 : 12} width={isMobile ? 30 : 40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'minutes') return formatDurationMinutes(value);
                    if (name === 'calories') return formatNumber(value);
                    return value;
                  }}
                />
                <Legend />
                <Bar dataKey="minutes" fill="#0ea5e9" name="Minutes" />
                <Bar dataKey="sessions" fill="#10b981" name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
