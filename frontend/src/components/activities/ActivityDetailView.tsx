import type { Activity } from '../../lib/api';
import { formatDuration, cn } from '../../lib/utils';
import { 
  Clock, 
  TrendingUp, 
  Heart, 
  Gauge, 
  Mountain,
  Activity as ActivityIcon
} from 'lucide-react';

interface ActivityDetailViewProps {
  activity: Activity;
}

function DataItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  // Don't render if value is null, undefined, or empty string
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  return (
    <div className="p-3 bg-background rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-mono">{value}</p>
    </div>
  );
}

function formatPace(speedMs: number | undefined): string | null {
  if (!speedMs || speedMs <= 0) return null;
  const paceMinPerKm = (1000 / speedMs) / 60;
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.floor((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSpeed(speedMs: number | undefined): string | null {
  if (!speedMs) return null;
  const kmh = speedMs * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

export function ActivityDetailView({ activity }: ActivityDetailViewProps) {
  // Defensive check - ensure activity exists
  if (!activity) {
    return <div className="text-gray-500 text-sm">No activity data available</div>;
  }

  const activityType = activity.activity_type?.toLowerCase() || '';
  const isRunning = activityType.includes('running') || activityType === 'walking' || activityType === 'rucking';
  const isCycling = activityType.includes('cycling') || activityType === 'biking';
  const isStrength = activityType === 'strength_training';
  const isCardio = isRunning || isCycling;
  
  // Calculate strength training summary
  let strengthSummary = null;
  if (isStrength && activity.strength_sets && activity.strength_sets.length > 0) {
    const activeSets = activity.strength_sets.filter(s => s.exercise_name?.toLowerCase() !== 'rest');
    const totalReps = activeSets.reduce((sum, s) => sum + (s.reps || 0), 0);
    const totalVolume = activeSets.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight_kg || 0)), 0);
    const uniqueExercises = new Set(activeSets.map(s => s.exercise_name).filter(Boolean));
    
    strengthSummary = {
      totalSets: activeSets.length,
      totalReps,
      totalVolume,
      exerciseCount: uniqueExercises.size
    };
  }
  
  return (
    <div className="space-y-4">
      {/* Overview Section */}
      <div>
        <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
          <ActivityIcon className="w-4 h-4 text-accent" />
          Overview
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DataItem 
            label="Duration" 
            value={formatDuration(activity.duration_seconds || 0)} 
          />
          {activity.distance_meters != null && activity.distance_meters > 0 && (
            <DataItem 
              label="Distance" 
              value={`${(activity.distance_meters / 1000).toFixed(2)} km`} 
            />
          )}
          {activity.calories != null && activity.calories > 0 && (
            <DataItem 
              label="Calories" 
              value={activity.calories.toLocaleString()} 
            />
          )}
          {activity.average_speed != null && activity.average_speed > 0 && isCardio && (
            <DataItem 
              label="Average Pace" 
              value={formatPace(activity.average_speed)} 
            />
          )}
          {activity.elapsed_duration != null && activity.elapsed_duration > 0 && (
            <DataItem 
              label="Elapsed Time" 
              value={formatDuration(activity.elapsed_duration)} 
            />
          )}
          {activity.moving_duration != null && activity.moving_duration > 0 && (
            <DataItem 
              label="Moving Time" 
              value={formatDuration(activity.moving_duration)} 
            />
          )}
        </div>
      </div>

      {/* Performance Metrics */}
      {(activity.average_speed || activity.max_speed || activity.cadence || activity.stride_length || 
        activity.average_power || activity.elevation_gain) && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <TrendingUp className="w-4 h-4 text-accent" />
            Performance
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activity.max_speed && isCardio && (
              <DataItem 
                label="Max Speed" 
                value={formatSpeed(activity.max_speed)} 
              />
            )}
            {activity.cadence && (
              <DataItem 
                label="Cadence" 
                value={`${activity.cadence} ${activityType.includes('running') || activityType === 'walking' ? 'spm' : 'rpm'}`} 
              />
            )}
            {activity.stride_length != null && activity.stride_length > 0 && (
              <DataItem 
                label="Stride Length" 
                value={`${(activity.stride_length * 100).toFixed(0)} cm`} 
              />
            )}
            {activity.average_power != null && typeof activity.average_power === 'number' && (
              <DataItem 
                label="Avg Power" 
                value={`${activity.average_power.toFixed(0)} W`} 
              />
            )}
            {activity.max_power != null && typeof activity.max_power === 'number' && (
              <DataItem 
                label="Max Power" 
                value={`${activity.max_power.toFixed(0)} W`} 
              />
            )}
            {activity.normalized_power != null && typeof activity.normalized_power === 'number' && (
              <DataItem 
                label="Normalized Power" 
                value={`${activity.normalized_power.toFixed(0)} W`} 
              />
            )}
          </div>
        </div>
      )}

      {/* Elevation */}
      {(activity.elevation_gain || activity.elevation_loss) && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <Mountain className="w-4 h-4 text-accent" />
            Elevation
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activity.elevation_gain != null && typeof activity.elevation_gain === 'number' && (
              <DataItem 
                label="Elevation Gain" 
                value={`${activity.elevation_gain.toFixed(0)} m`} 
              />
            )}
            {activity.elevation_loss != null && typeof activity.elevation_loss === 'number' && (
              <DataItem 
                label="Elevation Loss" 
                value={`${activity.elevation_loss.toFixed(0)} m`} 
              />
            )}
          </div>
        </div>
      )}

      {/* Heart Rate - Show for ALL activity types if data exists */}
      {activity.heart_rate && 
       (activity.heart_rate.avg !== undefined || 
        activity.heart_rate.max !== undefined || 
        activity.heart_rate.min !== undefined || 
        activity.heart_rate.resting !== undefined) && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <Heart className="w-4 h-4 text-accent" />
            Heart Rate
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activity.heart_rate.avg !== undefined && activity.heart_rate.avg !== null && (
              <DataItem 
                label="Average HR" 
                value={`${activity.heart_rate.avg} bpm`} 
              />
            )}
            {activity.heart_rate.max !== undefined && activity.heart_rate.max !== null && (
              <DataItem 
                label="Max HR" 
                value={`${activity.heart_rate.max} bpm`} 
              />
            )}
            {activity.heart_rate.min !== undefined && activity.heart_rate.min !== null && (
              <DataItem 
                label="Min HR" 
                value={`${activity.heart_rate.min} bpm`} 
              />
            )}
            {activity.heart_rate.resting !== undefined && activity.heart_rate.resting !== null && (
              <DataItem 
                label="Resting HR" 
                value={`${activity.heart_rate.resting} bpm`} 
              />
            )}
          </div>
        </div>
      )}

      {/* Training Metrics */}
      {activity.training && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <Gauge className="w-4 h-4 text-accent" />
            Training Effect
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activity.training.aerobic_effect != null && typeof activity.training.aerobic_effect === 'number' && (
              <DataItem 
                label="Aerobic Effect" 
                value={activity.training.aerobic_effect.toFixed(1)} 
              />
            )}
            {activity.training.anaerobic_effect != null && typeof activity.training.anaerobic_effect === 'number' && (
              <DataItem 
                label="Anaerobic Effect" 
                value={activity.training.anaerobic_effect.toFixed(1)} 
              />
            )}
            {activity.training.vo2_max != null && typeof activity.training.vo2_max === 'number' && (
              <DataItem 
                label="VO₂ Max" 
                value={activity.training.vo2_max.toFixed(1)} 
              />
            )}
            {activity.training.recovery_time != null && typeof activity.training.recovery_time === 'number' && (
              <DataItem 
                label="Recovery Time" 
                value={formatDuration(activity.training.recovery_time)} 
              />
            )}
            {activity.training.performance_condition != null && typeof activity.training.performance_condition === 'number' && (
              <DataItem 
                label="Performance Condition" 
                value={`${activity.training.performance_condition > 0 ? '+' : ''}${activity.training.performance_condition}`} 
              />
            )}
            {activity.training.training_effect_label && (
              <DataItem 
                label="Training Effect" 
                value={activity.training.training_effect_label} 
              />
            )}
          </div>
        </div>
      )}

      {/* Laps */}
      {activity.laps && activity.laps.length > 0 && (() => {
        const laps = activity.laps!;
        const hasHr = laps.some(l => l.average_hr || l.max_hr);
        return (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Clock className="w-4 h-4 text-accent" />
              Laps ({laps.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="py-1 pr-4">Lap</th>
                    <th className="py-1 pr-4 text-right">Duration</th>
                    <th className="py-1 pr-4 text-right">Distance</th>
                    <th className="py-1 pr-4 text-right">Pace</th>
                    {hasHr && (
                      <>
                        <th className="py-1 pr-4 text-right">Avg HR</th>
                        <th className="py-1 pr-4 text-right">Max HR</th>
                      </>
                    )}
                    {laps.some(l => l.calories) && (
                      <th className="py-1 pr-4 text-right">Calories</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {laps.map((lap, idx) => (
                    <tr key={idx} className="border-t border-card-border/30">
                      <td className="py-1.5 pr-4 font-medium">
                        {lap.lap_number ?? idx + 1}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {lap.duration ? formatDuration(lap.duration) : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {lap.distance ? `${(lap.distance / 1000).toFixed(2)} km` : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {lap.average_speed ? formatPace(lap.average_speed) : '—'}
                      </td>
                      {hasHr && (
                        <>
                          <td className="py-1.5 pr-4 text-right font-mono">
                            {lap.average_hr ? `${lap.average_hr} bpm` : '—'}
                          </td>
                          <td className="py-1.5 pr-4 text-right font-mono">
                            {lap.max_hr ? `${lap.max_hr} bpm` : '—'}
                          </td>
                        </>
                      )}
                      {laps.some(l => l.calories) && (
                        <td className="py-1.5 pr-4 text-right font-mono">
                          {lap.calories ?? '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Splits */}
      {activity.splits && activity.splits.length > 0 && (() => {
        const splits = activity.splits!;
        const hasHr = splits.some(s => s.average_hr || s.max_hr);
        const hasCalories = splits.some(s => s.calories);
        const hasElevation = splits.some(s => s.elevation_gain);
        return (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Clock className="w-4 h-4 text-accent" />
              Splits ({splits.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="py-1 pr-4">Type</th>
                    <th className="py-1 pr-4 text-right">Duration</th>
                    <th className="py-1 pr-4 text-right">Distance</th>
                    <th className="py-1 pr-4 text-right">Pace</th>
                    {hasHr && (
                      <>
                        <th className="py-1 pr-4 text-right">Avg HR</th>
                        <th className="py-1 pr-4 text-right">Max HR</th>
                      </>
                    )}
                    {hasCalories && (
                      <th className="py-1 pr-4 text-right">Calories</th>
                    )}
                    {hasElevation && (
                      <th className="py-1 pr-4 text-right">Elevation</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {splits.map((split, idx) => (
                    <tr key={idx} className="border-t border-card-border/30">
                      <td className="py-1.5 pr-4 capitalize">
                        {split.split_type?.replace(/_/g, ' ').toLowerCase() || '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {split.duration ? formatDuration(split.duration) : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {split.distance ? `${(split.distance / 1000).toFixed(2)} km` : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {split.average_speed ? formatPace(split.average_speed) : '—'}
                      </td>
                      {hasHr && (
                        <>
                          <td className="py-1.5 pr-4 text-right font-mono">
                            {split.average_hr ? `${split.average_hr} bpm` : '—'}
                          </td>
                          <td className="py-1.5 pr-4 text-right font-mono">
                            {split.max_hr ? `${split.max_hr} bpm` : '—'}
                          </td>
                        </>
                      )}
                      {hasCalories && (
                        <td className="py-1.5 pr-4 text-right font-mono">
                          {split.calories ?? '—'}
                        </td>
                      )}
                      {hasElevation && (
                        <td className="py-1.5 pr-4 text-right font-mono">
                          {split.elevation_gain ? `${split.elevation_gain.toFixed(0)} m` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Strength Summary */}
      {isStrength && strengthSummary && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <ActivityIcon className="w-4 h-4 text-accent" />
            Workout Summary
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {strengthSummary.totalSets > 0 && (
              <DataItem label="Total Sets" value={strengthSummary.totalSets} />
            )}
            {strengthSummary.totalReps > 0 && (
              <DataItem label="Total Reps" value={strengthSummary.totalReps.toLocaleString()} />
            )}
            {strengthSummary.totalVolume > 0 && (
              <DataItem label="Total Volume" value={`${(strengthSummary.totalVolume / 1000).toFixed(1)} tons`} />
            )}
            {strengthSummary.exerciseCount > 0 && (
              <DataItem label="Exercises" value={strengthSummary.exerciseCount} />
            )}
          </div>
        </div>
      )}

      {/* Strength Sets */}
      {isStrength && activity.strength_sets && activity.strength_sets.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <ActivityIcon className="w-4 h-4 text-accent" />
            Exercise Sets ({activity.strength_sets.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1 pr-4">#</th>
                  <th className="py-1 pr-4">Exercise</th>
                  <th className="py-1 pr-4 text-right">Reps</th>
                  <th className="py-1 pr-4 text-right">Weight</th>
                  <th className="py-1 pr-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {activity.strength_sets.map((set) => {
                  const isRest = set.exercise_name?.toLowerCase() === 'rest';
                  return (
                    <tr 
                      key={set.id} 
                      className={cn(
                        "border-t border-card-border/30",
                        isRest && "bg-card/30"
                      )}
                    >
                      <td className="py-1.5 pr-4 text-gray-500">{set.set_number}</td>
                      <td className={cn(
                        "py-1.5 pr-4 font-medium",
                        isRest && "text-gray-400 italic"
                      )}>
                        {set.exercise_name}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {set.reps !== null && set.reps !== undefined ? set.reps : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {set.weight_kg 
                          ? `${set.weight_kg.toFixed(1)} kg (${(set.weight_kg * 2.205).toFixed(0)} lbs)`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono text-gray-400">
                        {set.duration_seconds 
                          ? `${Math.round(set.duration_seconds)}s (${(set.duration_seconds / 60).toFixed(1)}m)`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

