import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, Cell } from 'recharts';
import { calculateLoadRatioStatus } from '../../lib/utils';
import type { TrainingLoad } from '../../lib/api';

interface TrainingLoadCardProps {
  data: TrainingLoad | null;
  loading?: boolean;
}

export function TrainingLoadCard({ data, loading }: TrainingLoadCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Training Load
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

  if (!data || data.status === 'no_data') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Training Load
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No training data available</p>
            <p className="text-sm mt-1">Sync your data to see training load</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Note: insufficient_data status will still render below, just with a warning

  const statusInfo = calculateLoadRatioStatus(data.load_ratio);
  
  // Prepare gauge data (0-1.5 ratio mapped to 0-100%)
  const maxRatio = 1.5;
  const gaugeValue = Math.min((data.load_ratio / maxRatio) * 100, 100);
  
  // Get color hex value based on status
  const getColorHex = (status: string) => {
    switch (status) {
      case 'optimal': return '#10b981'; // green
      case 'caution': return '#f59e0b'; // amber
      case 'danger': return '#ef4444'; // red
      case 'under_training': return '#f59e0b'; // amber
      default: return '#6b7280'; // gray
    }
  };
  
  const gaugeData = [
    { name: 'Load', value: gaugeValue, fill: getColorHex(statusInfo.status) },
  ];

  const StatusIcon = 
    statusInfo.status === 'optimal' ? CheckCircle :
    statusInfo.status === 'caution' ? AlertTriangle :
    statusInfo.status === 'danger' ? XCircle :
    Activity;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Training Load
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Load Ratio Gauge */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="60%"
                outerRadius="90%"
                data={gaugeData}
                startAngle={180}
                endAngle={0}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={10}
                  fill={getColorHex(statusInfo.status)}
                >
                  <Cell fill={getColorHex(statusInfo.status)} />
                </RadialBar>
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="relative -mt-32 flex flex-col items-center justify-center">
              <p className="text-4xl font-bold font-mono text-accent">{data.load_ratio.toFixed(2)}</p>
              <p className="text-sm text-gray-400">Load Ratio</p>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-card-border">
            <div>
              <p className="text-xs text-gray-500">Acute (7d)</p>
              <p className="text-lg font-mono">{data.acute_load.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Chronic (28d avg)</p>
              <p className="text-lg font-mono">{data.chronic_load.toFixed(1)}</p>
            </div>
          </div>

          {/* Status */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            statusInfo.status === 'optimal' ? 'bg-success/20' :
            statusInfo.status === 'caution' ? 'bg-warning/20' :
            statusInfo.status === 'danger' ? 'bg-danger/20' :
            'bg-gray-800'
          }`}>
            <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</p>
              <p className="text-xs text-gray-400 mt-1">{data.recommendation}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

