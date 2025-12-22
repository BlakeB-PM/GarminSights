import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { getScoreColor, getScoreBgColor, cn } from '../../lib/utils';

interface RecoveryScoreProps {
  recoveryScore: number;
  status: string;
  message: string;
  trainingLoadRatio?: number;
  sleepAverage?: number;
  bodyBattery?: number;
  stress?: number;
}

export function RecoveryScore({
  recoveryScore,
  status,
  message,
  trainingLoadRatio,
  sleepAverage,
  bodyBattery,
  stress,
}: RecoveryScoreProps) {
  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference - (recoveryScore / 100) * circumference;

  const statusColors = {
    excellent: 'text-success border-success',
    good: 'text-accent border-accent',
    fair: 'text-warning border-warning',
    low: 'text-danger border-danger',
    unknown: 'text-gray-400 border-gray-400',
  };

  const statusColor = statusColors[status as keyof typeof statusColors] || statusColors.unknown;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-accent/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          Recovery Score
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="flex items-center gap-8">
          {/* Circular Progress */}
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg className="transform -rotate-90 w-32 h-32">
              <circle
                cx="50%"
                cy="50%"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-800"
              />
              <circle
                cx="50%"
                cy="50%"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className={cn('transition-all duration-500', getScoreColor(recoveryScore).replace('text-', 'text-'))}
                style={{
                  color: recoveryScore >= 80 ? '#10b981' : recoveryScore >= 60 ? '#0ea5e9' : recoveryScore >= 40 ? '#f59e0b' : '#ef4444',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className={cn('text-3xl font-bold font-mono', getScoreColor(recoveryScore))}>
                  {recoveryScore}
                </p>
                <p className="text-xs text-gray-400 capitalize">{status}</p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 space-y-3">
            <p className="text-sm text-gray-300">{message}</p>
            
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-card-border">
              {sleepAverage !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Sleep (7d avg)</p>
                  <p className="text-lg font-mono">{sleepAverage?.toFixed(1) ?? '—'}</p>
                </div>
              )}
              {bodyBattery !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Body Battery</p>
                  <p className="text-lg font-mono">{bodyBattery ?? '—'}</p>
                </div>
              )}
              {stress !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Stress</p>
                  <p className="text-lg font-mono">{stress?.toFixed(0) ?? '—'}</p>
                </div>
              )}
              {trainingLoadRatio !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Load Ratio</p>
                  <p className="text-lg font-mono">{trainingLoadRatio?.toFixed(2) ?? '—'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

