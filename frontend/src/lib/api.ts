/**
 * API client for GarminSights backend.
 *
 * Base URL resolution:
 *   - VITE_API_URL is a Vite build-time variable.  Set it in your deployment
 *     platform's environment (e.g. Vercel, Railway, Fly.io) before running
 *     `vite build`.  The value is baked into the static bundle — no runtime
 *     env injection needed on the frontend.
 *   - When VITE_API_URL is not set (local development) the client talks
 *     directly to http://localhost:8000 where the FastAPI dev server runs.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/**
 * Wrapper around fetch that always includes credentials.  Currently the
 * backend stores Garmin auth tokens server-side (Garth), so there are no
 * cookies to forward and this flag has no practical effect.  It is set in
 * anticipation of cookie-based auth being added in the future — the backend
 * already has allow_credentials=True in its CORSMiddleware, so no server
 * changes would be needed at that point.
 */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { credentials: 'include', ...init });
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ============================================
// Auth API
// ============================================

export interface AuthStatus {
  authenticated: boolean;
  username?: string | null;
  error?: string | null;
  needs_mfa?: boolean | null;
  mfa_token?: string | null;
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  const response = await apiFetch(`${API_BASE}/api/auth/status`);
  return handleResponse<AuthStatus>(response);
}

export interface LoginParams {
  email?: string;
  password?: string;
  mfa_code?: string;
  mfa_token?: string;
}

export async function login(params?: LoginParams): Promise<AuthStatus> {
  const body: Record<string, string | null> = {
    email: params?.email ?? null,
    password: params?.password ?? null,
    mfa_code: params?.mfa_code ?? null,
    mfa_token: params?.mfa_token ?? null,
  };
  const response = await apiFetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<AuthStatus>(response);
}

export async function logout(): Promise<AuthStatus> {
  const response = await apiFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  return handleResponse<AuthStatus>(response);
}

// ============================================
// Sync API
// ============================================

export interface SyncStatus {
  success: boolean;
  activities_synced: number;
  sleep_days_synced: number;
  dailies_synced: number;
  strength_sets_extracted: number;
  error?: string | null;
  warnings?: string[];
  details?: Record<string, unknown>;
}

export async function syncData(daysBack = 30): Promise<SyncStatus> {
  const response = await apiFetch(`${API_BASE}/api/sync/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      days_back: daysBack,
      sync_activities: true,
      sync_sleep: true,
      sync_dailies: true,
    }),
  });
  return handleResponse<SyncStatus>(response);
}

// ============================================
// Activities API
// ============================================

export interface Activity {
  id: number;
  garmin_id: string;
  activity_type: string;
  name?: string | null;
  start_time?: string | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  calories?: number | null;
}

export interface ActivityHeatmapDay {
  date: string;
  activity_count: number;
  total_duration_minutes: number;
  activity_types: string[];
}

export interface DashboardSummary {
  last_sleep_score?: number | null;
  last_body_battery?: number | null;
  weekly_steps: number;
  weekly_activities: number;
  last_updated?: string | null;
}

export interface ActivityBreakdown {
  period_days: number;
  breakdown: Array<{
    activity_type: string;
    count: number;
    total_minutes: number;
    total_calories: number;
  }>;
  totals: {
    sessions: number;
    minutes: number;
    calories: number;
  };
}

export interface TrainingLoad {
  acute_load: number;
  chronic_load: number;
  load_ratio: number;
  status: string;
  recommendation: string;
}

export async function getActivities(params: {
  limit?: number;
  offset?: number;
  activity_type?: string;
  start_date?: string;
  end_date?: string;
} = {}): Promise<Activity[]> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  if (params.activity_type) query.set('activity_type', params.activity_type);
  if (params.start_date) query.set('start_date', params.start_date);
  if (params.end_date) query.set('end_date', params.end_date);
  const response = await apiFetch(`${API_BASE}/api/activities/?${query}`);
  return handleResponse<Activity[]>(response);
}

export async function getActivityTypes(): Promise<{ types: string[] }> {
  const response = await apiFetch(`${API_BASE}/api/activities/types`);
  return handleResponse<{ types: string[] }>(response);
}

export async function getActivityDetails(activityId: number): Promise<Activity & Record<string, unknown>> {
  const response = await apiFetch(`${API_BASE}/api/activities/${activityId}`);
  return handleResponse<Activity & Record<string, unknown>>(response);
}

export async function getActivityHeatmap(days = 30): Promise<ActivityHeatmapDay[]> {
  const response = await apiFetch(`${API_BASE}/api/activities/heatmap?days=${days}`);
  return handleResponse<ActivityHeatmapDay[]>(response);
}

export async function getDashboardSummary(
  startDate?: string,
  endDate?: string,
): Promise<DashboardSummary> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/activities/dashboard/summary?${params}`);
  return handleResponse<DashboardSummary>(response);
}

export async function getTrainingLoad(
  startDate?: string,
  endDate?: string,
): Promise<TrainingLoad> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/activities/training-load?${params}`);
  return handleResponse<TrainingLoad>(response);
}

export async function getActivityBreakdown(
  days?: number,
  startDate?: string,
  endDate?: string,
): Promise<ActivityBreakdown> {
  const params = new URLSearchParams();
  if (days != null) params.set('days', String(days));
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/activities/breakdown?${params}`);
  return handleResponse<ActivityBreakdown>(response);
}

// ============================================
// Wellness API
// ============================================

export interface SleepData {
  id: number;
  date: string;
  sleep_score?: number | null;
  total_sleep_seconds?: number | null;
  deep_sleep_seconds?: number | null;
  light_sleep_seconds?: number | null;
  rem_sleep_seconds?: number | null;
  awake_seconds?: number | null;
  hrv_average?: number | null;
  resting_hr?: number | null;
}

export interface DailyData {
  id: number;
  date: string;
  steps?: number | null;
  distance_meters?: number | null;
  active_calories?: number | null;
  calories_total?: number | null;
  body_battery_high?: number | null;
  body_battery_low?: number | null;
  body_battery_charged?: number | null;
  body_battery_drained?: number | null;
  stress_average?: number | null;
  stress_high?: number | null;
  low_stress_duration?: number | null;
  medium_stress_duration?: number | null;
  high_stress_duration?: number | null;
  rest_stress_duration?: number | null;
  activity_stress_duration?: number | null;
  intensity_minutes_moderate?: number | null;
  intensity_minutes_vigorous?: number | null;
  intensity_minutes_goal?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  resting_heart_rate?: number | null;
}

export interface RecoveryStatus {
  status: string;
  recovery_score: number;
  message: string;
  details?: {
    sleep_score?: number | null;
    sleep_7day_avg?: number | null;
    body_battery?: number | null;
    stress_average?: number | null;
    hrv_average?: number | null;
  } | null;
}

export interface StressDistribution {
  low_stress_seconds: number;
  medium_stress_seconds: number;
  high_stress_seconds: number;
  rest_stress_seconds: number;
  activity_stress_seconds: number;
  total_seconds: number;
  avg_stress?: number | null;
  days_with_data: number;
}

export async function getSleepData(
  limit?: number,
  startDate?: string,
  endDate?: string,
): Promise<SleepData[]> {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/wellness/sleep?${params}`);
  return handleResponse<SleepData[]>(response);
}

export async function getDailyData(
  limit?: number,
  startDate?: string,
  endDate?: string,
): Promise<DailyData[]> {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/wellness/dailies?${params}`);
  return handleResponse<DailyData[]>(response);
}

export async function getDailyTrend(
  metric: string,
  days?: number,
  startDate?: string,
  endDate?: string,
): Promise<Array<{ date: string; value: number }>> {
  const params = new URLSearchParams({ metric });
  if (days != null) params.set('days', String(days));
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/wellness/dailies/trend?${params}`);
  return handleResponse<Array<{ date: string; value: number }>>(response);
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  const response = await apiFetch(`${API_BASE}/api/wellness/recovery`);
  return handleResponse<RecoveryStatus>(response);
}

export async function getStressDistribution(
  days?: number,
  startDate?: string,
  endDate?: string,
): Promise<StressDistribution> {
  const params = new URLSearchParams();
  if (days != null) params.set('days', String(days));
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const response = await apiFetch(`${API_BASE}/api/wellness/stress/distribution?${params}`);
  return handleResponse<StressDistribution>(response);
}

export async function getSleepTrend(
  days = 30,
): Promise<Array<{ date: string; sleep_score: number; hrv_average?: number | null }>> {
  const response = await apiFetch(`${API_BASE}/api/wellness/sleep/trend?days=${days}`);
  return handleResponse<Array<{ date: string; sleep_score: number; hrv_average?: number | null }>>(response);
}

// ============================================
// Strength API
// ============================================

export interface ExerciseProgress {
  exercise_name: string;
  date: string;
  estimated_1rm?: number | null;
  total_volume?: number | null;
  max_weight?: number | null;
  total_reps: number;
  total_sets: number;
}

export interface KeyLiftCard {
  exercise_name: string;
  best_recent_weight?: number | null;
  best_recent_reps?: number | null;
  estimated_1rm?: number | null;
  four_week_trend_lbs?: number | null;
  four_week_trend_percent?: number | null;
  volume_trend_percent?: number | null;
  last_trained_date?: string | null;
  days_since_last?: number | null;
  status: string;
}

export interface TrainingBalanceData {
  week_start: string;
  week_end: string;
  strength_sessions: number;
  cardio_sessions: number;
  zone2_sessions: number;
  vo2_sessions: number;
  strength_minutes: number;
  zone2_minutes: number;
  vo2_minutes: number;
}

export interface MuscleFrequency {
  muscle_group: string;
  avg_sessions_per_week: number;
  days_since_last?: number | null;
  total_sets: number;
  total_volume: number;
}

export interface VolumeTrendData {
  week_start: string;
  week_end: string;
  total_tonnage: number;
  total_sets: number;
  week_over_week_delta_percent?: number | null;
}

export interface MuscleComparisonData {
  week_start: string;
  week_end: string;
  muscle_groups: Record<string, number>;
}

export interface DrillDownActivity {
  activity_id: number;
  activity_name: string;
  start_time: string;
  duration_seconds?: number | null;
  sets: Array<{
    id: number;
    activity_id: number;
    exercise_name?: string | null;
    set_number?: number | null;
    reps?: number | null;
    weight_lbs?: number | null;
    duration_seconds?: number | null;
  }>;
}

export interface DrillDownResponse {
  period_start: string;
  period_end: string;
  total_activities: number;
  total_sets: number;
  activities: DrillDownActivity[];
}

export async function getExercises(): Promise<{ exercises: string[] }> {
  const response = await apiFetch(`${API_BASE}/api/strength/exercises`);
  return handleResponse<{ exercises: string[] }>(response);
}

export async function getExerciseProgress(
  exerciseName: string,
  days = 90,
): Promise<ExerciseProgress[]> {
  const response = await apiFetch(
    `${API_BASE}/api/strength/progress/${encodeURIComponent(exerciseName)}?days=${days}`,
  );
  return handleResponse<ExerciseProgress[]>(response);
}

export async function getPersonalRecords(limit = 10): Promise<Array<{
  exercise_name: string;
  estimated_1rm: number;
  max_weight_lifted: number;
  date_achieved: string;
}>> {
  const response = await apiFetch(`${API_BASE}/api/strength/prs?limit=${limit}`);
  return handleResponse(response);
}

export async function getMuscleGroupVolume(
  days = 30,
): Promise<Record<string, { volume: number; sets: number; exercises: string[] }>> {
  const response = await apiFetch(`${API_BASE}/api/strength/muscle-groups?days=${days}`);
  return handleResponse(response);
}

export async function getKeyLifts(): Promise<KeyLiftCard[]> {
  const response = await apiFetch(`${API_BASE}/api/strength/key-lifts`);
  return handleResponse<KeyLiftCard[]>(response);
}

export async function getTrainingBalance(weeks = 12): Promise<TrainingBalanceData[]> {
  const response = await apiFetch(`${API_BASE}/api/strength/training-balance?weeks=${weeks}`);
  return handleResponse<TrainingBalanceData[]>(response);
}

export async function getTrainingFrequency(
  weeks = 12,
  sortBy = 'frequency',
): Promise<MuscleFrequency[]> {
  const response = await apiFetch(
    `${API_BASE}/api/strength/frequency?weeks=${weeks}&sort_by=${sortBy}`,
  );
  return handleResponse<MuscleFrequency[]>(response);
}

export async function getVolumeTrends(
  weeks = 12,
  muscleGroup?: string,
): Promise<VolumeTrendData[]> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (muscleGroup) params.set('muscle_group', muscleGroup);
  const response = await apiFetch(`${API_BASE}/api/strength/volume-trends?${params}`);
  return handleResponse<VolumeTrendData[]>(response);
}

export async function getMuscleComparison(weeks = 12): Promise<MuscleComparisonData[]> {
  const response = await apiFetch(`${API_BASE}/api/strength/muscle-comparison?weeks=${weeks}`);
  return handleResponse<MuscleComparisonData[]>(response);
}

export async function getDrillDownData(
  muscleGroup: string,
  weekStart: string,
): Promise<DrillDownResponse> {
  const params = new URLSearchParams({ muscle_group: muscleGroup, week_start: weekStart });
  const response = await apiFetch(`${API_BASE}/api/strength/drill-down?${params}`);
  return handleResponse<DrillDownResponse>(response);
}

// ============================================
// Cycling API
// ============================================

export interface CyclingSummary {
  total_rides: number;
  total_duration_minutes: number;
  avg_power?: number | null;
  avg_normalized_power?: number | null;
  avg_cadence?: number | null;
  avg_ef?: number | null;
  estimated_ftp?: number | null;
  period_start: string;
  period_end: string;
}

export interface CyclingTrend {
  date: string;
  avg_power?: number | null;
  normalized_power?: number | null;
  cadence?: number | null;
  efficiency_factor?: number | null;
  distance_miles?: number | null;
  duration_minutes?: number | null;
  intensity_factor?: number | null;
  variability_index?: number | null;
}

export interface PowerCurveData {
  current: Record<string, number>;
  comparison?: Record<string, number> | null;
  period_start: string;
  period_end: string;
}

export interface PowerZonesData {
  zone_1?: { label: string; seconds: number; percent: number };
  zone_2?: { label: string; seconds: number; percent: number };
  zone_3?: { label: string; seconds: number; percent: number };
  zone_4?: { label: string; seconds: number; percent: number };
  zone_5?: { label: string; seconds: number; percent: number };
  zone_6?: { label: string; seconds: number; percent: number };
  zone_7?: { label: string; seconds: number; percent: number };
  [key: string]: { label: string; seconds: number; percent: number } | undefined;
}

export interface CadenceAnalysisData {
  distribution: Array<{ bucket: string; avg_power?: number | null; count: number }>;
  optimal_cadence_range?: string | null;
}

export interface DistanceDataPoint {
  label: string;
  miles: number;
  cumulative_miles?: number | null;
  date?: string | null;
}

export interface DistanceData {
  data: DistanceDataPoint[];
  total_miles: number;
  period_start: string;
  period_end: string;
}

export async function getCyclingSummary(days = 30): Promise<CyclingSummary> {
  const response = await apiFetch(`${API_BASE}/api/cycling/summary?days=${days}`);
  return handleResponse<CyclingSummary>(response);
}

export async function getCyclingTrends(days = 90): Promise<CyclingTrend[]> {
  const response = await apiFetch(`${API_BASE}/api/cycling/trends?days=${days}`);
  return handleResponse<CyclingTrend[]>(response);
}

export async function getPowerCurve(days = 30, comparisonWeeks = 4): Promise<PowerCurveData> {
  const response = await apiFetch(
    `${API_BASE}/api/cycling/power-curve?days=${days}&comparison_weeks=${comparisonWeeks}`,
  );
  return handleResponse<PowerCurveData>(response);
}

export async function getPowerZones(days = 30): Promise<PowerZonesData> {
  const response = await apiFetch(`${API_BASE}/api/cycling/power-zones?days=${days}`);
  return handleResponse<PowerZonesData>(response);
}

export async function getCadenceAnalysis(days = 90): Promise<CadenceAnalysisData> {
  const response = await apiFetch(`${API_BASE}/api/cycling/cadence?days=${days}`);
  return handleResponse<CadenceAnalysisData>(response);
}

export async function getDistanceData(
  days = 365,
  aggregation: 'session' | 'week' | 'month' = 'session',
  cumulative = false,
): Promise<DistanceData> {
  const params = new URLSearchParams({
    days: String(days),
    aggregation,
    cumulative: String(cumulative),
  });
  const response = await apiFetch(`${API_BASE}/api/cycling/distance?${params}`);
  return handleResponse<DistanceData>(response);
}

// ============================================
// Power-Cadence Scatter API
// ============================================

export interface PowerCadencePoint {
  activity_id: number;
  date: string;
  name: string | null;
  cadence: number;
  avg_power: number;
  normalized_power: number | null;
  efficiency_factor: number | null;
  avg_hr: number | null;
  duration_minutes: number;
}

export interface PowerCadenceScatterData {
  data: PowerCadencePoint[];
  total_rides: number;
  period_start: string;
  period_end: string;
}

export async function getPowerCadenceScatter(days?: number): Promise<PowerCadenceScatterData> {
  const params = new URLSearchParams();
  if (days != null) params.set('days', String(days));
  const response = await apiFetch(`${API_BASE}/api/cycling/power-cadence-scatter?${params}`);
  return handleResponse<PowerCadenceScatterData>(response);
}

// ============================================
// Power Curve History (Heatmap) API
// ============================================

export interface PowerCurveHistoryCell {
  power: number;
  percent_of_best: number;
}

export interface PowerCurveHistoryRow {
  month: string;
  label: string;
  [key: string]: PowerCurveHistoryCell | string | null;
}

export interface PowerCurveHistoryData {
  data: PowerCurveHistoryRow[];
  intervals: string[];
  all_time_best: Record<string, number>;
  period_start: string;
  period_end: string;
}

export async function getPowerCurveHistory(months?: number): Promise<PowerCurveHistoryData> {
  const params = new URLSearchParams();
  if (months != null) params.set('months', String(months));
  const response = await apiFetch(`${API_BASE}/api/cycling/power-curve-history?${params}`);
  return handleResponse<PowerCurveHistoryData>(response);
}

// ============================================
// Sleep-Performance Correlation API
// ============================================

export interface SleepPerformancePoint {
  activity_id: number;
  activity_date: string;
  activity_name: string | null;
  sleep_score: number | null;
  hrv: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  deep_sleep_hours: number | null;
  body_battery: number | null;
  stress_avg: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  efficiency_factor: number | null;
  duration_minutes: number;
  avg_hr: number | null;
}

export interface CorrelationStats {
  sleep_power_correlation: number;
  data_points: number;
  interpretation: 'positive' | 'negative' | 'neutral';
}

export interface SleepPerformanceData {
  data: SleepPerformancePoint[];
  correlation_stats: CorrelationStats | null;
  total_matched: number;
  period_start: string;
  period_end: string;
}

export async function getSleepPerformanceCorrelation(days?: number): Promise<SleepPerformanceData> {
  const params = new URLSearchParams();
  if (days != null) params.set('days', String(days));
  const response = await apiFetch(`${API_BASE}/api/cycling/sleep-performance?${params}`);
  return handleResponse<SleepPerformanceData>(response);
}

// ============================================
// AI Coach API
// ============================================

export interface ChatResponse {
  response: string;
  context_summary: Record<string, unknown>;
}

export async function sendChatMessage(
  message: string,
  contextDays = 7,
): Promise<ChatResponse> {
  const response = await apiFetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context_days: contextDays }),
  });
  return handleResponse<ChatResponse>(response);
}
