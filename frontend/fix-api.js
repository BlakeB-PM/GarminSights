const fs = require('fs');
const path = 'src/lib/api.ts';
let content = fs.readFileSync(path, 'utf8');

// Remove any corrupted appended content
content = content.replace(/\r?\n\/\/ =+\r?\n\/\/ Power-Cadence Scatter API[\s\S]*$/, '');

// Add the new exports
const newExports = `

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
  if (days) params.set('days', String(days));
  
  const response = await fetch(\`\${API_BASE}/api/cycling/power-cadence-scatter?\${params}\`);
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
  if (months) params.set('months', String(months));
  
  const response = await fetch(\`\${API_BASE}/api/cycling/power-curve-history?\${params}\`);
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
  if (days) params.set('days', String(days));
  
  const response = await fetch(\`\${API_BASE}/api/cycling/sleep-performance?\${params}\`);
  return handleResponse<SleepPerformanceData>(response);
}
`;

fs.writeFileSync(path, content + newExports);
console.log('File updated successfully');
console.log('New file length:', fs.readFileSync(path, 'utf8').length, 'chars');
