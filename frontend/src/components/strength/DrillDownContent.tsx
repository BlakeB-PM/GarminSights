import { getDrillDownData } from '../../lib/api';
import { formatDate, formatDateTime, formatWeightDual, formatDuration } from '../../lib/utils';

// Define types locally to avoid import issues
type StrengthSet = {
  id: number;
  activity_id: number;
  exercise_name: string | null;
  set_number: number | null;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

type DrillDownActivity = {
  activity_id: number;
  activity_name: string;
  start_time: string;
  duration_seconds: number | null;
  sets: StrengthSet[];
};

type DrillDownResponse = {
  period_start: string;
  period_end: string;
  total_activities: number;
  total_sets: number;
  activities: DrillDownActivity[];
};

interface DrillDownContentProps {
  data: DrillDownResponse | null;
  loading: boolean;
}

export function DrillDownContent({ data, loading }: DrillDownContentProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (!data || data.activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No activities found for this period.</p>
      </div>
    );
  }

  // Group activities by date
  const activitiesByDate: Record<string, DrillDownActivity[]> = {};
  const dateKeys: Array<{ key: string; date: Date }> = [];
  
  data.activities.forEach(activity => {
    const activityDate = new Date(activity.start_time);
    const dateKey = formatDate(activity.start_time, { year: 'numeric', month: 'long', day: 'numeric' });
    if (!activitiesByDate[dateKey]) {
      activitiesByDate[dateKey] = [];
      dateKeys.push({ key: dateKey, date: activityDate });
    }
    activitiesByDate[dateKey].push(activity);
  });

  // Sort dates (most recent first)
  const sortedDates = dateKeys
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(d => d.key);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-4 bg-card-border/50 rounded-lg space-y-2 text-sm">
        <p className="text-gray-100 font-medium">
          Period: {formatDate(data.period_start)} - {formatDate(data.period_end)}
        </p>
        <p className="text-gray-400">
          {data.total_activities} {data.total_activities === 1 ? 'activity' : 'activities'} • {data.total_sets} {data.total_sets === 1 ? 'set' : 'sets'}
        </p>
      </div>

      {/* Activities grouped by date */}
      <div className="space-y-6">
        {sortedDates.map(dateKey => (
          <div key={dateKey} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 border-b border-card-border pb-2">
              {dateKey}
            </h3>
            
            {activitiesByDate[dateKey].map(activity => (
              <div
                key={activity.activity_id}
                className="p-4 bg-card-border/30 rounded-lg space-y-3"
              >
                {/* Activity header */}
                <div className="space-y-1">
                  <h4 className="font-medium text-gray-100">{activity.activity_name}</h4>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{formatDateTime(activity.start_time)}</span>
                    {activity.duration_seconds && (
                      <span>Duration: {formatDuration(activity.duration_seconds)}</span>
                    )}
                  </div>
                </div>

                {/* Sets */}
                {activity.sets.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Sets ({activity.sets.length})
                    </div>
                    <div className="space-y-1">
                      {activity.sets.map((set, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 bg-[#1e1e2e]/50 rounded text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-8">
                              Set {set.set_number || idx + 1}
                            </span>
                            <span className="text-gray-200 font-medium">
                              {set.exercise_name || 'Unknown Exercise'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-gray-300">
                            {set.weight_kg && (
                              <span>{formatWeightDual(set.weight_kg)}</span>
                            )}
                            {set.reps && (
                              <span className="text-gray-400">× {set.reps} reps</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

