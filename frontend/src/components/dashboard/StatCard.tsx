import { cn, getScoreColor, getScoreBgColor } from '../../lib/utils';
import { Card } from '../ui/Card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  scoreValue?: number; // 0-100 for color coding
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  scoreValue,
}: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-gray-400';
  
  return (
    <Card hover className="relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-accent/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            'p-3 rounded-xl',
            scoreValue !== undefined ? getScoreBgColor(scoreValue) : 'bg-accent/10'
          )}>
            {icon}
          </div>
          
          {trend && trendValue && (
            <div className={cn('flex items-center gap-1 text-sm', trendColor)}>
              <TrendIcon className="w-4 h-4" />
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className={cn(
            'text-3xl font-bold font-mono',
            scoreValue !== undefined ? getScoreColor(scoreValue) : 'text-gray-100'
          )}>
            {value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

