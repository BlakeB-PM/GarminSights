import type { Activity } from '../../lib/api';
import { formatDuration, cn, formatDistanceDual, formatPaceDual, formatSpeedDual, formatElevationDual, formatStrideLengthDual, formatWeightDual } from '../../lib/utils';
import { 
  Clock, 
  TrendingUp, 
  Heart, 
  Gauge, 
  Mountain,
  Activity as ActivityIcon,
  Zap,
  Timer
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

// Format seconds to MM:SS or HH:MM:SS
function formatZoneTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format power interval key to readable label
function formatPowerInterval(seconds: string): string {
  const secs = parseInt(seconds, 10);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min`;
  return `${Math.floor(secs / 3600)}hr`;
}

// HR Zone colors (matching Garmin's zone colors)
const HR_ZONE_COLORS = [
  'bg-gray-500',      // Zone 1 - Recovery (gray)
  'bg-blue-500',      // Zone 2 - Easy (blue)
  'bg-green-500',     // Zone 3 - Aerobic (green)
  'bg-yellow-500',    // Zone 4 - Threshold (yellow)
  'bg-red-500',       // Zone 5 - Anaerobic (red)
];

// Power Zone colors (matching common power zone schemes)
const POWER_ZONE_COLORS = [
  'bg-gray-400',      // Zone 1 - Active Recovery
  'bg-blue-400',      // Zone 2 - Endurance
  'bg-green-400',     // Zone 3 - Tempo
  'bg-yellow-400',    // Zone 4 - Threshold
  'bg-orange-400',    // Zone 5 - VO2max
  'bg-red-400',       // Zone 6 - Anaerobic
  'bg-purple-400',    // Zone 7 - Neuromuscular
];

// Legacy functions kept for backward compatibility, but we'll use dual format functions
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
  const isCycling = activityType.includes('cycling') || activityType === 'biking' || activityType.includes('virtual_ride') || activityType.includes('indoor_cycling');
  const isStrength = activityType === 'strength_training';
  const isCardio = isRunning || isCycling;
  
  // Check if this activity has power data (cycling with power meter or smart trainer)
  const hasPowerData = activity.average_power != null && activity.average_power > 0;
  
  // Calculate strength training summary
  let strengthSummary = null;
  if (isStrength && activity.strength_sets && activity.strength_sets.length > 0) {
    const activeSets = activity.strength_sets.filter(s => s.exercise_name?.toLowerCase() !== 'rest');
    const totalReps = activeSets.reduce((sum, s) => sum + (s.reps || 0), 0);
    const totalVolume = activeSets.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight_lbs || 0)), 0);
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
              value={formatDistanceDual(activity.distance_meters)} 
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
              value={formatPaceDual(activity.average_speed)} 
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
                value={formatSpeedDual(activity.max_speed)} 
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
                value={formatStrideLengthDual(activity.stride_length)} 
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
                value={formatElevationDual(activity.elevation_gain)} 
              />
            )}
            {activity.elevation_loss != null && typeof activity.elevation_loss === 'number' && (
              <DataItem 
                label="Elevation Loss" 
                value={formatElevationDual(activity.elevation_loss)} 
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

      {/* Cycling Power Metrics */}
      {isCycling && hasPowerData && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <Zap className="w-4 h-4 text-accent" />
            Power
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DataItem 
              label="Avg Power" 
              value={`${Math.round(activity.average_power!)} W`} 
            />
            {activity.normalized_power != null && (
              <DataItem 
                label="Normalized Power" 
                value={`${Math.round(activity.normalized_power)} W`} 
              />
            )}
            {activity.max_power != null && (
              <DataItem 
                label="Max Power" 
                value={`${Math.round(activity.max_power)} W`} 
              />
            )}
            {activity.max_20min_power != null && (
              <DataItem 
                label="20min Power" 
                value={`${Math.round(activity.max_20min_power)} W`} 
              />
            )}
            {activity.max_20min_power != null && (
              <DataItem 
                label="Est. FTP (95%)" 
                value={`${Math.round(activity.max_20min_power * 0.95)} W`} 
              />
            )}
            {activity.cadence != null && (
              <DataItem 
                label="Avg Cadence" 
                value={`${activity.cadence} rpm`} 
              />
            )}
            {activity.max_cadence != null && (
              <DataItem 
                label="Max Cadence" 
                value={`${activity.max_cadence} rpm`} 
              />
            )}
          </div>
        </div>
      )}

      {/* HR Zones */}
      {activity.hr_zones && Object.keys(activity.hr_zones).length > 0 && (() => {
        const zones = activity.hr_zones!;
        const totalTime = Object.values(zones).reduce((sum, val) => sum + val, 0);
        
        return (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Heart className="w-4 h-4 text-accent" />
              Heart Rate Zones
            </h4>
            <div className="space-y-2">
              {/* Zone bar visualization */}
              <div className="flex h-6 rounded-lg overflow-hidden">
                {Object.entries(zones)
                  .sort(([a], [b]) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]))
                  .map(([zone, seconds], idx) => {
                    const percentage = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
                    if (percentage < 1) return null;
                    return (
                      <div
                        key={zone}
                        className={cn(HR_ZONE_COLORS[idx], 'flex items-center justify-center text-xs font-medium text-white')}
                        style={{ width: `${percentage}%` }}
                        title={`Zone ${idx + 1}: ${formatZoneTime(seconds)} (${percentage.toFixed(0)}%)`}
                      >
                        {percentage > 10 && `Z${idx + 1}`}
                      </div>
                    );
                  })}
              </div>
              {/* Zone breakdown */}
              <div className="grid grid-cols-5 gap-2 text-xs">
                {Object.entries(zones)
                  .sort(([a], [b]) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]))
                  .map(([zone, seconds], idx) => {
                    const percentage = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
                    return (
                      <div key={zone} className="text-center">
                        <div className={cn('w-3 h-3 rounded-full mx-auto mb-1', HR_ZONE_COLORS[idx])} />
                        <div className="text-gray-400">Zone {idx + 1}</div>
                        <div className="font-mono">{formatZoneTime(seconds)}</div>
                        <div className="text-gray-500">{percentage.toFixed(0)}%</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Power Zones */}
      {activity.power_zones && Object.keys(activity.power_zones).length > 0 && (() => {
        const zones = activity.power_zones!;
        const totalTime = Object.values(zones).reduce((sum, val) => sum + val, 0);
        const activeZones = Object.entries(zones).filter(([, seconds]) => seconds > 0);
        
        return (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Zap className="w-4 h-4 text-accent" />
              Power Zones
            </h4>
            <div className="space-y-2">
              {/* Zone bar visualization */}
              <div className="flex h-6 rounded-lg overflow-hidden">
                {activeZones
                  .sort(([a], [b]) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]))
                  .map(([zone, seconds]) => {
                    const idx = parseInt(zone.split('_')[1]) - 1;
                    const percentage = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
                    if (percentage < 1) return null;
                    return (
                      <div
                        key={zone}
                        className={cn(POWER_ZONE_COLORS[idx], 'flex items-center justify-center text-xs font-medium text-white')}
                        style={{ width: `${percentage}%` }}
                        title={`Zone ${idx + 1}: ${formatZoneTime(seconds)} (${percentage.toFixed(0)}%)`}
                      >
                        {percentage > 10 && `Z${idx + 1}`}
                      </div>
                    );
                  })}
              </div>
              {/* Zone breakdown */}
              <div className="grid grid-cols-7 gap-1 text-xs">
                {Object.entries(zones)
                  .sort(([a], [b]) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]))
                  .map(([zone, seconds]) => {
                    const idx = parseInt(zone.split('_')[1]) - 1;
                    const percentage = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
                    return (
                      <div key={zone} className="text-center">
                        <div className={cn('w-3 h-3 rounded-full mx-auto mb-1', POWER_ZONE_COLORS[idx])} />
                        <div className="text-gray-400">Z{idx + 1}</div>
                        <div className="font-mono text-[10px]">{formatZoneTime(seconds)}</div>
                        {percentage > 0 && <div className="text-gray-500">{percentage.toFixed(0)}%</div>}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Power Curve */}
      {activity.power_curve && Object.keys(activity.power_curve).length > 0 && (() => {
        const curve = activity.power_curve!;
        const sortedIntervals = Object.entries(curve).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        return (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Timer className="w-4 h-4 text-accent" />
              Best Power
            </h4>
            <div className="overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {sortedIntervals.map(([interval, power]) => (
                  <div 
                    key={interval} 
                    className="p-2 bg-background rounded-lg text-center min-w-[60px]"
                  >
                    <div className="text-xs text-gray-400 mb-1">{formatPowerInterval(interval)}</div>
                    <div className="font-mono font-medium">{power}W</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Intensity Minutes */}
      {(activity.intensity_minutes_moderate != null || activity.intensity_minutes_vigorous != null) && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
            <TrendingUp className="w-4 h-4 text-accent" />
            Intensity Minutes
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activity.intensity_minutes_moderate != null && (
              <DataItem 
                label="Moderate" 
                value={`${activity.intensity_minutes_moderate} min`} 
              />
            )}
            {activity.intensity_minutes_vigorous != null && (
              <DataItem 
                label="Vigorous" 
                value={`${activity.intensity_minutes_vigorous} min`} 
              />
            )}
            {(activity.intensity_minutes_moderate != null || activity.intensity_minutes_vigorous != null) && (
              <DataItem 
                label="Total (2x Vigorous)" 
                value={`${(activity.intensity_minutes_moderate || 0) + (activity.intensity_minutes_vigorous || 0) * 2} min`} 
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
                        {lap.distance ? formatDistanceDual(lap.distance) : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {lap.average_speed ? formatPaceDual(lap.average_speed) : '—'}
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
                        {split.distance ? formatDistanceDual(split.distance) : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        {split.average_speed ? formatPaceDual(split.average_speed) : '—'}
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
                          {split.elevation_gain ? formatElevationDual(split.elevation_gain) : '—'}
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
                        {formatWeightDual(set.weight_lbs)}
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

