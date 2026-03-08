import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a large number with comma separators. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

/**
 * Format a duration in seconds as HH:MM:SS or MM:SS.
 * Examples: 3661 → "1:01:01", 90 → "1:30"
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format minutes as a human-readable string.
 * Examples: 90 → "1h 30m", 45 → "45m"
 */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * Format meters as "X.X mi".
 * Example: 5000 → "3.1 mi"
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || meters === 0) return '—';
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format meters showing both miles and km.
 * Example: 5000 → "3.1 mi / 5.0 km"
 */
export function formatDistanceDual(meters: number | null | undefined): string {
  if (meters == null || meters === 0) return '—';
  const miles = meters / 1609.34;
  const km = meters / 1000;
  return `${miles.toFixed(1)} mi / ${km.toFixed(1)} km`;
}

/**
 * Format a pace from m/s as "X:XX /mi / X:XX /km".
 * Example: 3.0 m/s → "8:57 /mi / 5:33 /km"
 */
export function formatPaceDual(metersPerSecond: number | null | undefined): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '—';
  const secsPerKm = 1000 / metersPerSecond;
  const secsPerMile = 1609.34 / metersPerSecond;
  const fmtPace = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = Math.round(totalSec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  return `${fmtPace(secsPerMile)} /mi / ${fmtPace(secsPerKm)} /km`;
}

/**
 * Format speed in m/s as "X.X mph / X.X km/h".
 * Example: 3.0 m/s → "6.7 mph / 10.8 km/h"
 */
export function formatSpeedDual(metersPerSecond: number | null | undefined): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '—';
  const mph = metersPerSecond * 2.23694;
  const kmh = metersPerSecond * 3.6;
  return `${mph.toFixed(1)} mph / ${kmh.toFixed(1)} km/h`;
}

/**
 * Format elevation in meters as "X ft / X m".
 * Example: 100 → "328 ft / 100 m"
 */
export function formatElevationDual(meters: number | null | undefined): string {
  if (meters == null) return '—';
  const feet = meters * 3.28084;
  return `${Math.round(feet)} ft / ${Math.round(meters)} m`;
}

/**
 * Format stride length in meters as "X.X ft / X.XX m".
 * Example: 1.5 → "4.9 ft / 1.50 m"
 */
export function formatStrideLengthDual(meters: number | null | undefined): string {
  if (meters == null || meters <= 0) return '—';
  const feet = meters * 3.28084;
  return `${feet.toFixed(1)} ft / ${meters.toFixed(2)} m`;
}

/**
 * Format weight in lbs with kg in parentheses.
 * Example: 135 → "135 lbs (61.2 kg)"
 */
export function formatWeightDual(lbs: number | null | undefined): string {
  if (lbs == null || lbs === 0) return '—';
  const kg = lbs * 0.453592;
  return `${lbs} lbs (${kg.toFixed(1)} kg)`;
}

/**
 * Format volume (lbs × reps) showing both lbs and kg.
 * Example: 10000 → "10,000 lbs (4,536 kg)"
 */
export function formatVolumeDual(lbs: number | null | undefined): string {
  if (lbs == null || lbs === 0) return '—';
  const kg = lbs * 0.453592;
  return `${Math.round(lbs).toLocaleString()} lbs (${Math.round(kg).toLocaleString()} kg)`;
}

/** Format an ISO datetime string to a readable local date+time. */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format a date string (YYYY-MM-DD or ISO) to a readable short date. */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  // Parse date-only strings without timezone shift by treating as local midnight
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Convert an activity_type slug to a human-readable name. */
export function getActivityTypeName(type: string | null | undefined): string {
  if (!type) return 'Unknown';
  const map: Record<string, string> = {
    strength_training: 'Strength Training',
    running: 'Running',
    treadmill_running: 'Treadmill Running',
    cycling: 'Cycling',
    virtual_ride: 'Virtual Ride',
    indoor_cycling: 'Indoor Cycling',
    swimming: 'Swimming',
    hiking: 'Hiking',
    walking: 'Walking',
    yoga: 'Yoga',
    cardio: 'Cardio',
    elliptical: 'Elliptical',
    rowing: 'Rowing',
  };
  return map[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get a Tailwind text-color class based on a 0-100 score.
 * Used for sleep scores, body battery, recovery, etc.
 */
export function getScoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get a Tailwind background-color class based on a 0-100 score.
 */
export function getScoreBgColor(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-500/20';
  if (score >= 80) return 'bg-green-500/20';
  if (score >= 60) return 'bg-yellow-500/20';
  if (score >= 40) return 'bg-orange-500/20';
  return 'bg-red-500/20';
}

/**
 * Derive a UI status from the training load ratio (acute / chronic).
 */
export function calculateLoadRatioStatus(ratio: number | null | undefined): {
  label: string;
  color: string;
  status: 'no_data' | 'under_training' | 'optimal' | 'caution' | 'danger';
} {
  if (ratio == null) return { label: 'No Data', color: 'text-gray-400', status: 'no_data' };
  if (ratio < 0.8) return { label: 'Under Training', color: 'text-blue-400', status: 'under_training' };
  if (ratio <= 1.3) return { label: 'Optimal', color: 'text-green-400', status: 'optimal' };
  if (ratio <= 1.5) return { label: 'Caution', color: 'text-yellow-400', status: 'caution' };
  return { label: 'High Risk', color: 'text-red-400', status: 'danger' };
}

/**
 * Map a stress category name to a Tailwind color class.
 */
export function getStressCategoryColor(category: string): string {
  const map: Record<string, string> = {
    rest: 'text-blue-400',
    low: 'text-green-400',
    medium: 'text-yellow-400',
    high: 'text-red-400',
    activity: 'text-purple-400',
  };
  return map[category.toLowerCase()] ?? 'text-gray-400';
}

/**
 * Return a human-readable label describing a date range.
 * Examples: "Today", "This week", "This month", "Mar 1 – Mar 7", etc.
 */
export function getDateRangeLabel(startDate: string, endDate: string): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const getWeekStart = (d: Date): string => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const ws = new Date(d);
    ws.setDate(diff);
    return ws.toISOString().split('T')[0];
  };
  const getWeekEnd = (d: Date): string => {
    const ws = new Date(getWeekStart(d));
    ws.setDate(ws.getDate() + 6);
    return ws.toISOString().split('T')[0];
  };
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastWeekStartDate = (() => {
    const ws = new Date(getWeekStart(today));
    ws.setDate(ws.getDate() - 7);
    return ws.toISOString().split('T')[0];
  })();
  const lastWeekEndDate = (() => {
    const ws = new Date(lastWeekStartDate);
    ws.setDate(ws.getDate() + 6);
    return ws.toISOString().split('T')[0];
  })();
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];

  if (startDate === todayStr && endDate === todayStr) return 'Today';
  if (startDate === getWeekStart(today) && endDate === getWeekEnd(today)) return 'This week';
  if (startDate === monthStart && endDate === todayStr) return 'This month';
  if (startDate === lastWeekStartDate && endDate === lastWeekEndDate) return 'Last week';
  if (startDate === lastMonthStart && endDate === lastMonthEnd) return 'Last month';

  // Generic range label
  const fmt = (d: string) => {
    const parts = d.split('-');
    const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  if (startDate === endDate) return fmt(startDate);
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

/**
 * Format an ISO datetime string as a human-friendly "last synced" label.
 * Examples: "Synced today at 2:34 PM", "Synced yesterday", "Synced Mar 3"
 */
export function formatLastSynced(isoString: string | null): string {
  if (!isoString) return 'Never synced';
  const date = new Date(isoString);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dateStr = date.toISOString().split('T')[0];
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  if (dateStr === todayStr) {
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `Synced today at ${time}`;
  }
  if (dateStr === yesterdayStr) return 'Synced yesterday';
  return `Synced ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Calculate sleep stage percentages from raw seconds.
 */
export function calculateSleepStagePercentages(sleep: {
  total_sleep_seconds?: number | null;
  deep_sleep_seconds?: number | null;
  light_sleep_seconds?: number | null;
  rem_sleep_seconds?: number | null;
  awake_seconds?: number | null;
}): {
  deep: number;
  light: number;
  rem: number;
  awake: number;
} {
  const total = sleep.total_sleep_seconds ?? 0;
  if (total === 0) return { deep: 0, light: 0, rem: 0, awake: 0 };
  const pct = (val: number | null | undefined) =>
    Math.round(((val ?? 0) / total) * 100);
  return {
    deep: pct(sleep.deep_sleep_seconds),
    light: pct(sleep.light_sleep_seconds),
    rem: pct(sleep.rem_sleep_seconds),
    awake: pct(sleep.awake_seconds),
  };
}
