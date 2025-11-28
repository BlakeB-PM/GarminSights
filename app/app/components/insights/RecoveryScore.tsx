'use client';

interface RecoveryScoreProps {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  factors?: {
    sleep: { score: number; status: string };
    stress: { score: number; status: string };
    heartRate: { score: number; status: string };
    activity: { score: number; status: string };
  };
  recommendations?: string[];
}

export default function RecoveryScore({
  score,
  level,
  factors,
  recommendations = [],
}: RecoveryScoreProps) {
  const levelColors = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    fair: 'bg-yellow-500',
    poor: 'bg-orange-500',
    critical: 'bg-red-500',
  };
  
  const levelTextColors = {
    excellent: 'text-green-600 dark:text-green-400',
    good: 'text-blue-600 dark:text-blue-400',
    fair: 'text-yellow-600 dark:text-yellow-400',
    poor: 'text-orange-600 dark:text-orange-400',
    critical: 'text-red-600 dark:text-red-400',
  };
  
  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference - (score / 100) * circumference;
  
  return (
    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
          Recovery Score
        </h3>
        <div className="relative inline-block">
          <svg className="transform -rotate-90 w-32 h-32">
            <circle
              cx="64"
              cy="64"
              r="45"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="64"
              cy="64"
              r="45"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={levelTextColors[level]}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-3xl font-bold ${levelTextColors[level]}`}>
                {score}
              </div>
              <div className={`text-xs capitalize ${levelTextColors[level]}`}>
                {level}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {factors && (
        <div className="space-y-3 mb-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Factors:
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-xs">
              <div className="text-gray-600 dark:text-gray-400">Sleep</div>
              <div className="font-medium">{factors.sleep.score}/100</div>
            </div>
            <div className="text-xs">
              <div className="text-gray-600 dark:text-gray-400">Stress</div>
              <div className="font-medium">{factors.stress.score}/100</div>
            </div>
            <div className="text-xs">
              <div className="text-gray-600 dark:text-gray-400">Heart Rate</div>
              <div className="font-medium">{factors.heartRate.score}/100</div>
            </div>
            <div className="text-xs">
              <div className="text-gray-600 dark:text-gray-400">Activity</div>
              <div className="font-medium">{factors.activity.score}/100</div>
            </div>
          </div>
        </div>
      )}
      
      {recommendations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Recommendations:
          </div>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

