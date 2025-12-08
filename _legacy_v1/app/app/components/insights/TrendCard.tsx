'use client';

interface TrendCardProps {
  title: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  significance?: 'high' | 'medium' | 'low';
  formatValue?: (value: number) => string;
}

export default function TrendCard({
  title,
  current,
  previous,
  change,
  changePercent,
  trend,
  significance = 'low',
  formatValue = (v) => v.toLocaleString(),
}: TrendCardProps) {
  const absChangePercent = Math.abs(changePercent);
  const isPositive = trend === 'up';
  
  const trendColor = isPositive 
    ? 'text-green-600 dark:text-green-400' 
    : trend === 'down'
    ? 'text-red-600 dark:text-red-400'
    : 'text-gray-600 dark:text-gray-400';
  
  const trendIcon = isPositive ? '↑' : trend === 'down' ? '↓' : '→';
  
  const significanceColor = significance === 'high' 
    ? 'bg-opacity-20' 
    : significance === 'medium'
    ? 'bg-opacity-10'
    : 'bg-opacity-5';
  
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {formatValue(current)}
      </div>
      <div className={`flex items-center gap-2 text-sm ${trendColor}`}>
        <span className="font-medium">{trendIcon}</span>
        <span>
          {absChangePercent.toFixed(1)}% {isPositive ? 'increase' : trend === 'down' ? 'decrease' : 'change'}
        </span>
        {significance === 'high' && (
          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
            Significant
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
        Previous: {formatValue(previous)}
      </div>
    </div>
  );
}

