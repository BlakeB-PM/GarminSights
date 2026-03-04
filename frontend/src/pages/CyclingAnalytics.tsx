import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { TimeFrameSelector } from '../components/strength/TimeFrameSelector';
import { Bike, Zap, TrendingUp, Activity, Route, Moon, Target } from 'lucide-react';
import {
  getCyclingSummary,
  getCyclingTrends,
  getPowerCurve,
  getPowerZones,
  getCadenceAnalysis,
  getDistanceData,
  getPowerCadenceScatter,
  getPowerCurveHistory,
  getSleepPerformanceCorrelation,
  type CyclingSummary,
  type CyclingTrend,
  type PowerCurveData,
  type PowerZonesData,
  type CadenceAnalysisData,
  type DistanceData,
  type PowerCadenceScatterData,
  type PowerCurveHistoryData,
  type SleepPerformanceData,
} from '../lib/api';
import { cn } from '../lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Scatter,
} from 'recharts';

// Power zone colors
const ZONE_COLORS = {
  zone_1: '#6b7280', // Gray - Active Recovery
  zone_2: '#22c55e', // Green - Endurance
  zone_3: '#eab308', // Yellow - Tempo
  zone_4: '#f97316', // Orange - Threshold
  zone_5: '#ef4444', // Red - VO2max
  zone_6: '#a855f7', // Purple - Anaerobic
  zone_7: '#ec4899', // Pink - Neuromuscular
};

// Helper to format date strings without timezone issues
// Parses "YYYY-MM-DD" directly without creating a Date object that shifts timezones
function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Create date at noon to avoid timezone issues
  const date = new Date(`${dateStr}T12:00:00`);
  return `${days[date.getDay()]}, ${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

export function CyclingAnalytics() {
  // State for data
  const [summary, setSummary] = useState<CyclingSummary | null>(null);
  const [trends, setTrends] = useState<CyclingTrend[]>([]);
  const [powerCurve, setPowerCurve] = useState<PowerCurveData | null>(null);
  const [powerZones, setPowerZones] = useState<PowerZonesData | null>(null);
  const [cadenceData, setCadenceData] = useState<CadenceAnalysisData | null>(null);
  const [distanceData, setDistanceData] = useState<DistanceData | null>(null);
  const [powerCadenceScatter, setPowerCadenceScatter] = useState<PowerCadenceScatterData | null>(null);
  const [powerCurveHistory, setPowerCurveHistory] = useState<PowerCurveHistoryData | null>(null);
  const [sleepPerformance, setSleepPerformance] = useState<SleepPerformanceData | null>(null);
  
  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Time frame state
  const [summaryDays, setSummaryDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [trendsDays, setTrendsDays] = useState<7 | 14 | 30 | 60 | 90>(90);
  const [powerCurveDays, setPowerCurveDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [powerZonesDays, setPowerZonesDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [cadenceDays, setCadenceDays] = useState<7 | 14 | 30 | 60 | 90>(90);
  
  // Distance chart state
  const [distanceAggregation, setDistanceAggregation] = useState<'session' | 'week' | 'month'>('session');
  const [distanceCumulative, setDistanceCumulative] = useState(false);
  const [distanceDays, setDistanceDays] = useState<90 | 180 | 365>(365);
  
  // New chart states
  const [scatterDays, setScatterDays] = useState<7 | 14 | 30 | 60 | 90>(90);
  const [historyMonths, setHistoryMonths] = useState<3 | 6 | 9 | 12>(6);
  const [sleepPerfDays, setSleepPerfDays] = useState<7 | 14 | 30 | 60 | 90>(90);

  // Fetch all data on mount and when time frames change
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const newErrors: Record<string, string> = {};
      
      try {
        const summaryData = await getCyclingSummary(summaryDays);
        setSummary(summaryData);
      } catch (e) {
        newErrors.summary = e instanceof Error ? e.message : 'Failed to load summary';
      }
      
      try {
        const trendsData = await getCyclingTrends(trendsDays);
        setTrends(trendsData);
      } catch (e) {
        newErrors.trends = e instanceof Error ? e.message : 'Failed to load trends';
      }
      
      try {
        const curveData = await getPowerCurve(powerCurveDays, 4);
        setPowerCurve(curveData);
      } catch (e) {
        newErrors.powerCurve = e instanceof Error ? e.message : 'Failed to load power curve';
      }
      
      try {
        const zonesData = await getPowerZones(powerZonesDays);
        setPowerZones(zonesData);
      } catch (e) {
        newErrors.powerZones = e instanceof Error ? e.message : 'Failed to load power zones';
      }
      
      try {
        const cadence = await getCadenceAnalysis(cadenceDays);
        setCadenceData(cadence);
      } catch (e) {
        newErrors.cadence = e instanceof Error ? e.message : 'Failed to load cadence data';
      }
      
      setErrors(newErrors);
      setLoading(false);
    };
    
    fetchData();
  }, [summaryDays, trendsDays, powerCurveDays, powerZonesDays, cadenceDays]);

  // Fetch new chart data
  useEffect(() => {
    const fetchNewChartData = async () => {
      try {
        const scatterData = await getPowerCadenceScatter(scatterDays);
        setPowerCadenceScatter(scatterData);
      } catch (e) {
        console.error('Failed to load power-cadence scatter:', e);
      }
      
      try {
        const historyData = await getPowerCurveHistory(historyMonths);
        setPowerCurveHistory(historyData);
      } catch (e) {
        console.error('Failed to load power curve history:', e);
      }
      
      try {
        const sleepData = await getSleepPerformanceCorrelation(sleepPerfDays);
        setSleepPerformance(sleepData);
      } catch (e) {
        console.error('Failed to load sleep-performance data:', e);
      }
    };
    
    fetchNewChartData();
  }, [scatterDays, historyMonths, sleepPerfDays]);

  // Fetch distance data separately since it has its own controls
  useEffect(() => {
    const fetchDistanceData = async () => {
      try {
        const data = await getDistanceData(distanceDays, distanceAggregation, distanceCumulative);
        setDistanceData(data);
      } catch (e) {
        console.error('Failed to load distance data:', e);
      }
    };
    
    fetchDistanceData();
  }, [distanceDays, distanceAggregation, distanceCumulative]);

  // Format power curve data for chart
  const powerCurveChartData = powerCurve ? (() => {
    const intervals = ['1', '5', '10', '30', '60', '120', '300', '600', '1200', '1800'];
    const labels: Record<string, string> = {
      '1': '1s',
      '5': '5s',
      '10': '10s',
      '30': '30s',
      '60': '1m',
      '120': '2m',
      '300': '5m',
      '600': '10m',
      '1200': '20m',
      '1800': '30m',
    };
    
    return intervals.map(interval => ({
      interval: labels[interval],
      current: powerCurve.current[interval] || 0,
      comparison: powerCurve.comparison?.[interval] || 0,
    })).filter(d => d.current > 0 || d.comparison > 0);
  })() : [];

  // Format power zones for pie chart
  const powerZonesChartData = powerZones ? 
    Object.entries(powerZones)
      .filter(([key]) => key.startsWith('zone_'))
      .map(([key, value]) => ({
        name: (value as { label: string; seconds: number; percent: number }).label,
        value: (value as { seconds: number }).seconds,
        percent: (value as { percent: number }).percent,
        color: ZONE_COLORS[key as keyof typeof ZONE_COLORS],
      }))
      .filter(d => d.value > 0)
    : [];

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <Header 
          title="Cycling Analytics" 
          subtitle="Power-based performance insights"
        />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading cycling data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Header
        title="Cycling Analytics" 
        subtitle="Power-based performance insights"
      />
      
      {/* Section 1: Core KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Estimated FTP */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Estimated FTP</p>
                <p className="text-3xl font-bold text-gray-100">
                  {summary?.estimated_ftp ? `${Math.round(summary.estimated_ftp)}W` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {summary?.estimated_ftp ? `${(summary.estimated_ftp / 95.25).toFixed(1)} W/kg @ 210lb` : 'No data'}
                </p>
              </div>
              <div className="p-3 bg-accent/10 rounded-xl">
                <Zap className="w-6 h-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Average Power */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Avg Power ({summaryDays}d)</p>
                <p className="text-3xl font-bold text-gray-100">
                  {summary?.avg_power ? `${Math.round(summary.avg_power)}W` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  NP: {summary?.avg_normalized_power ? `${Math.round(summary.avg_normalized_power)}W` : '—'}
                </p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-xl">
                <Activity className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Average Cadence */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Avg Cadence ({summaryDays}d)</p>
                <p className="text-3xl font-bold text-gray-100">
                  {summary?.avg_cadence ? `${Math.round(summary.avg_cadence)}` : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">RPM</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Bike className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Efficiency Factor */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Avg EF ({summaryDays}d)</p>
                <p className="text-3xl font-bold text-gray-100">
                  {summary?.avg_ef ? summary.avg_ef.toFixed(2) : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {summary?.total_rides} rides, {summary?.total_duration_minutes ? Math.round(summary.total_duration_minutes / 60) : 0}h
                </p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <TrendingUp className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Time frame selector for KPIs */}
      <div className="flex justify-end">
        <TimeFrameSelector
          value={summaryDays}
          onChange={(v) => setSummaryDays(v as 7 | 14 | 30 | 60 | 90)}
          type="days"
        />
      </div>

      {/* Section 2: Power Trends Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Power & Efficiency Trends</CardTitle>
            <CardDescription>Average power, normalized power, and efficiency factor per ride</CardDescription>
          </div>
          <TimeFrameSelector
            value={trendsDays}
            onChange={(v) => setTrendsDays(v as 7 | 14 | 30 | 60 | 90)}
            type="days"
          />
        </CardHeader>
        <CardContent>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={trends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af"
                  tickFormatter={formatDateLabel}
                />
                <YAxis yAxisId="power" stroke="#9ca3af" label={{ value: 'Watts', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                <YAxis yAxisId="ef" orientation="right" stroke="#9ca3af" label={{ value: 'EF', angle: 90, position: 'insideRight', fill: '#9ca3af' }} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'EF') return [value?.toFixed(2), 'EF'];
                    return [value ? `${Math.round(value)}W` : '—', name];
                  }}
                  labelFormatter={formatDateFull}
                />
                <Legend />
                <Line 
                  yAxisId="power"
                  type="monotone" 
                  dataKey="avg_power" 
                  name="Avg Power" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
                  connectNulls
                />
                <Line 
                  yAxisId="power"
                  type="monotone" 
                  dataKey="normalized_power" 
                  name="NP" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                  connectNulls
                />
                <Line 
                  yAxisId="ef"
                  type="monotone" 
                  dataKey="efficiency_factor" 
                  name="EF" 
                  stroke="#a855f7" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#a855f7', strokeWidth: 0, r: 4 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No cycling data available for this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Cadence Per Session */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cadence Per Session</CardTitle>
            <CardDescription>Average cadence for each ride</CardDescription>
          </div>
          <TimeFrameSelector
            value={trendsDays}
            onChange={(v) => setTrendsDays(v as 7 | 14 | 30 | 60 | 90)}
            type="days"
          />
        </CardHeader>
        <CardContent>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af"
                  tickFormatter={formatDateLabel}
                />
                <YAxis stroke="#9ca3af" domain={[60, 'auto']} label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number) => [`${Math.round(value)} RPM`, 'Cadence']}
                  labelFormatter={formatDateFull}
                />
                <Bar 
                  dataKey="cadence" 
                  name="Cadence"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No cadence data available for this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Distance / Miles */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Route className="w-5 h-5" />
                Miles Ridden
                {distanceData && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    Total: {distanceData.total_miles.toFixed(1)} mi
                  </span>
                )}
              </CardTitle>
              <CardDescription>Distance per {distanceAggregation}</CardDescription>
            </div>
            
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Aggregation toggle */}
              <div className="flex rounded-lg overflow-hidden border border-card-border">
                <button
                  onClick={() => setDistanceAggregation('session')}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors",
                    distanceAggregation === 'session' ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  Session
                </button>
                <button
                  onClick={() => setDistanceAggregation('week')}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors border-l border-card-border",
                    distanceAggregation === 'week' ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  Week
                </button>
                <button
                  onClick={() => setDistanceAggregation('month')}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors border-l border-card-border",
                    distanceAggregation === 'month' ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  Month
                </button>
              </div>
              
              {/* Cumulative toggle */}
              <button
                onClick={() => setDistanceCumulative(!distanceCumulative)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  distanceCumulative 
                    ? 'bg-accent text-white border-accent' 
                    : 'bg-transparent text-gray-400 border-card-border hover:text-gray-200'
                )}
              >
                Cumulative
              </button>
              
              {/* Time range */}
              <div className="flex rounded-lg overflow-hidden border border-card-border">
                <button
                  onClick={() => setDistanceDays(90)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors",
                    distanceDays === 90 ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  3mo
                </button>
                <button
                  onClick={() => setDistanceDays(180)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors border-l border-card-border",
                    distanceDays === 180 ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  6mo
                </button>
                <button
                  onClick={() => setDistanceDays(365)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors border-l border-card-border",
                    distanceDays === 365 ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                  )}
                >
                  1yr
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {distanceData && distanceData.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={distanceData.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="label" 
                  stroke="#9ca3af"
                  tick={{ fontSize: 11 }}
                  interval={distanceAggregation === 'session' ? 'preserveStartEnd' : 0}
                  angle={distanceAggregation === 'week' ? -45 : 0}
                  textAnchor={distanceAggregation === 'week' ? 'end' : 'middle'}
                  height={distanceAggregation === 'week' ? 60 : 30}
                />
                <YAxis 
                  yAxisId="miles"
                  stroke="#9ca3af" 
                  label={{ value: 'Miles', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} 
                />
                {distanceCumulative && (
                  <YAxis 
                    yAxisId="cumulative"
                    orientation="right"
                    stroke="#9ca3af" 
                    label={{ value: 'Total Miles', angle: 90, position: 'insideRight', fill: '#9ca3af' }} 
                  />
                )}
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Cumulative') return [`${value.toFixed(1)} mi`, 'Total'];
                    return [`${value.toFixed(1)} mi`, 'Miles'];
                  }}
                />
                <Legend />
                <Bar 
                  yAxisId="miles"
                  dataKey="miles" 
                  name="Miles"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
                {distanceCumulative && (
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulative_miles"
                    name="Cumulative"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No distance data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Power Curve */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Power Curve</CardTitle>
            <CardDescription>Best power output at each duration (current vs 4 weeks ago)</CardDescription>
          </div>
          <TimeFrameSelector
            value={powerCurveDays}
            onChange={(v) => setPowerCurveDays(v as 7 | 14 | 30 | 60 | 90)}
            type="days"
          />
        </CardHeader>
        <CardContent>
          {powerCurveChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={powerCurveChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="interval" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" label={{ value: 'Watts', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number) => [`${value}W`, '']}
                />
                <Legend />
                <Bar dataKey="current" name="Current" fill="#22c55e" radius={[4, 4, 0, 0]} />
                {powerCurve?.comparison && Object.keys(powerCurve.comparison).length > 0 && (
                  <Bar dataKey="comparison" name="4 Weeks Ago" fill="#6b7280" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No power curve data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 6: Power Zones and Cadence Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Power Zones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Power Zone Distribution</CardTitle>
              <CardDescription>Time spent in each power zone</CardDescription>
            </div>
            <TimeFrameSelector
              value={powerZonesDays}
              onChange={(v) => setPowerZonesDays(v as 7 | 14 | 30 | 60 | 90)}
              type="days"
            />
          </CardHeader>
          <CardContent>
            {powerZonesChartData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={250}>
                  <PieChart>
                    <Pie
                      data={powerZonesChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {powerZonesChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(value: number) => [`${Math.round(value / 60)}min`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {powerZonesChartData.map((zone, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                        <span className="text-gray-300">{zone.name}</span>
                      </div>
                      <span className="text-gray-400">{zone.percent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                No power zone data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cadence Analysis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Cadence Analysis</CardTitle>
              <CardDescription>
                Power output by cadence range
                {cadenceData?.optimal_cadence_range && (
                  <span className="ml-2 text-accent">
                    Optimal: {cadenceData.optimal_cadence_range} RPM
                  </span>
                )}
              </CardDescription>
            </div>
            <TimeFrameSelector
              value={cadenceDays}
              onChange={(v) => setCadenceDays(v as 7 | 14 | 30 | 60 | 90)}
              type="days"
            />
          </CardHeader>
          <CardContent>
            {cadenceData?.distribution && cadenceData.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cadenceData.distribution} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="bucket" stroke="#9ca3af" label={{ value: 'RPM', position: 'bottom', fill: '#9ca3af' }} />
                  <YAxis stroke="#9ca3af" label={{ value: 'Avg Power (W)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#f3f4f6' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'avg_power') return [value ? `${Math.round(value)}W` : '—', 'Avg Power'];
                      return [value, name];
                    }}
                  />
                  <Bar 
                    dataKey="avg_power" 
                    name="Avg Power"
                    radius={[4, 4, 0, 0]}
                  >
                    {cadenceData.distribution.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.bucket === cadenceData.optimal_cadence_range ? '#22c55e' : '#6b7280'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                No cadence data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 7: Power vs Cadence Box Plot */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Power by Cadence Range
            </CardTitle>
            <CardDescription>
              Power distribution across cadence ranges (box plot: min, Q1, median, Q3, max)
              {powerCadenceScatter?.total_rides && (
                <span className="ml-2 text-gray-500">
                  ({powerCadenceScatter.total_rides} rides)
                </span>
              )}
            </CardDescription>
          </div>
          <TimeFrameSelector
            value={scatterDays}
            onChange={(v) => setScatterDays(v as 7 | 14 | 30 | 60 | 90)}
            type="days"
          />
        </CardHeader>
        <CardContent>
          {(() => {
            // Compute box plot data from scatter points
            if (!powerCadenceScatter?.data || powerCadenceScatter.data.length === 0) {
              return (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  No power/cadence data available
                </div>
              );
            }

            // Define cadence buckets
            const buckets = [
              { label: '60-70', min: 60, max: 70 },
              { label: '70-80', min: 70, max: 80 },
              { label: '80-90', min: 80, max: 90 },
              { label: '90-100', min: 90, max: 100 },
              { label: '100-110', min: 100, max: 110 },
              { label: '110+', min: 110, max: 999 },
            ];

            // Group data by cadence bucket
            const boxPlotData = buckets.map(bucket => {
              const points = powerCadenceScatter.data
                .filter(p => p.cadence >= bucket.min && p.cadence < bucket.max && p.avg_power)
                .map(p => p.avg_power)
                .sort((a, b) => a - b);

              if (points.length === 0) {
                return { bucket: bucket.label, min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 };
              }

              const n = points.length;
              const q1Idx = Math.floor(n * 0.25);
              const medianIdx = Math.floor(n * 0.5);
              const q3Idx = Math.floor(n * 0.75);

              return {
                bucket: bucket.label,
                min: points[0],
                q1: points[q1Idx],
                median: points[medianIdx],
                q3: points[q3Idx],
                max: points[n - 1],
                count: n,
              };
            }).filter(d => d.count > 0);

            if (boxPlotData.length === 0) {
              return (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  Not enough data to generate box plot
                </div>
              );
            }

            // Find best median for highlighting
            const bestBucket = boxPlotData.reduce((best, curr) => 
              curr.median > best.median ? curr : best
            , boxPlotData[0]);

            return (
              <>
                <div className="flex items-end justify-center gap-6 h-80 px-4">
                  {boxPlotData.map((d, idx) => {
                    const maxPower = Math.max(...boxPlotData.map(b => b.max));
                    const scale = (val: number) => (val / maxPower) * 260; // 260px max height
                    const isBest = d.bucket === bestBucket.bucket;
                    
                    return (
                      <div key={idx} className="flex flex-col items-center gap-2">
                        {/* Box plot visualization */}
                        <div className="relative flex flex-col items-center" style={{ height: 280 }}>
                          {/* Whisker line (min to max) */}
                          <div
                            className="absolute w-0.5 bg-gray-500"
                            style={{
                              bottom: scale(d.min),
                              height: scale(d.max - d.min),
                            }}
                          />
                          
                          {/* Min whisker cap */}
                          <div
                            className="absolute w-4 h-0.5 bg-gray-500"
                            style={{ bottom: scale(d.min), transform: 'translateX(-50%)' }}
                          />
                          
                          {/* Max whisker cap */}
                          <div
                            className="absolute w-4 h-0.5 bg-gray-500"
                            style={{ bottom: scale(d.max), transform: 'translateX(-50%)' }}
                          />
                          
                          {/* Box (Q1 to Q3) */}
                          <div
                            className={cn(
                              "absolute w-12 rounded border-2",
                              isBest ? "bg-green-600/30 border-green-500" : "bg-blue-600/30 border-blue-500"
                            )}
                            style={{
                              bottom: scale(d.q1),
                              height: scale(d.q3 - d.q1),
                            }}
                          />
                          
                          {/* Median line */}
                          <div
                            className={cn(
                              "absolute w-12 h-1 rounded",
                              isBest ? "bg-green-400" : "bg-blue-400"
                            )}
                            style={{
                              bottom: scale(d.median) - 2,
                            }}
                          />
                          
                          {/* Labels */}
                          <div 
                            className="absolute text-xs text-gray-400 whitespace-nowrap"
                            style={{ bottom: scale(d.max) + 8 }}
                          >
                            {d.max}W
                          </div>
                          <div 
                            className={cn(
                              "absolute text-sm font-semibold whitespace-nowrap",
                              isBest ? "text-green-400" : "text-blue-400"
                            )}
                            style={{ 
                              bottom: scale(d.median) + 8,
                              left: '100%',
                              marginLeft: 8,
                            }}
                          >
                            {d.median}W
                          </div>
                          <div 
                            className="absolute text-xs text-gray-500 whitespace-nowrap"
                            style={{ bottom: scale(d.min) - 18 }}
                          >
                            {d.min}W
                          </div>
                        </div>
                        
                        {/* Bucket label */}
                        <div className={cn(
                          "text-sm font-medium mt-2",
                          isBest ? "text-green-400" : "text-gray-300"
                        )}>
                          {d.bucket}
                        </div>
                        <div className="text-xs text-gray-500">
                          n={d.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Legend */}
                <div className="mt-6 flex items-center justify-center gap-8 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-6 rounded border-2 bg-green-600/30 border-green-500" />
                    <span className="text-gray-400">Optimal range (highest median power)</span>
                  </div>
                  <div className="text-gray-500 text-xs">
                    Box: Q1–Q3 | Line: Median | Whiskers: Min–Max
                  </div>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Section 8: Sleep → Performance Correlation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Moon className="w-5 h-5" />
              Sleep → Performance
            </CardTitle>
            <CardDescription>
              How sleep quality affects your cycling power
              {sleepPerformance?.correlation_stats && (
                <span className={cn(
                  "ml-2 font-medium",
                  sleepPerformance.correlation_stats.interpretation === 'positive' ? 'text-green-400' :
                  sleepPerformance.correlation_stats.interpretation === 'negative' ? 'text-red-400' : 'text-gray-400'
                )}>
                  r = {sleepPerformance.correlation_stats.sleep_power_correlation.toFixed(2)}
                  {sleepPerformance.correlation_stats.interpretation === 'positive' && ' ↗ positive correlation'}
                  {sleepPerformance.correlation_stats.interpretation === 'negative' && ' ↘ negative correlation'}
                  {sleepPerformance.correlation_stats.interpretation === 'neutral' && ' — no clear correlation'}
                </span>
              )}
            </CardDescription>
          </div>
          <TimeFrameSelector
            value={sleepPerfDays}
            onChange={(v) => setSleepPerfDays(v as 7 | 14 | 30 | 60 | 90)}
            type="days"
          />
        </CardHeader>
        <CardContent>
          {(() => {
            if (!sleepPerformance?.data || sleepPerformance.data.length === 0) {
              return (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  No sleep/performance data available. Sync sleep data and ride on days with sleep tracking.
                </div>
              );
            }

            // Filter data points with valid sleep_score and avg_power
            const validData = sleepPerformance.data.filter(
              d => d.sleep_score != null && d.avg_power != null
            );

            if (validData.length < 2) {
              return (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  Need at least 2 data points to show trend
                </div>
              );
            }

            // Calculate linear regression for trend line
            const n = validData.length;
            const sumX = validData.reduce((acc, d) => acc + (d.sleep_score ?? 0), 0);
            const sumY = validData.reduce((acc, d) => acc + (d.avg_power ?? 0), 0);
            const sumXY = validData.reduce((acc, d) => acc + (d.sleep_score ?? 0) * (d.avg_power ?? 0), 0);
            const sumX2 = validData.reduce((acc, d) => acc + (d.sleep_score ?? 0) ** 2, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
            const intercept = (sumY - slope * sumX) / n;

            // Calculate trend line endpoints
            const minSleep = Math.min(...validData.map(d => d.sleep_score ?? 0));
            const maxSleep = Math.max(...validData.map(d => d.sleep_score ?? 0));
            
            const trendLineData = [
              { sleep_score: minSleep, trendPower: slope * minSleep + intercept },
              { sleep_score: maxSleep, trendPower: slope * maxSleep + intercept },
            ];

            return (
              <>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      type="number" 
                      dataKey="sleep_score" 
                      name="Sleep Score" 
                      stroke="#9ca3af"
                      domain={[Math.max(40, minSleep - 5), Math.min(100, maxSleep + 5)]}
                      label={{ value: 'Sleep Score', position: 'bottom', fill: '#9ca3af', offset: 20 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="avg_power" 
                      name="Avg Power" 
                      unit="W"
                      stroke="#9ca3af"
                      label={{ value: 'Avg Power (W)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0]?.payload;
                          if (!data || data.trendPower !== undefined) return null; // Skip trend line points
                          return (
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
                              <p className="text-gray-200 font-medium">{data.activity_name || 'Ride'}</p>
                              <p className="text-gray-400 text-sm">{data.activity_date}</p>
                              <div className="mt-2 space-y-1 text-sm">
                                <p><span className="text-gray-400">Sleep Score:</span> <span className="text-purple-400">{data.sleep_score}</span></p>
                                <p><span className="text-gray-400">Avg Power:</span> <span className="text-green-400">{data.avg_power}W</span></p>
                                {data.sleep_hours && <p><span className="text-gray-400">Sleep:</span> <span className="text-gray-300">{data.sleep_hours.toFixed(1)}h</span></p>}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    
                    {/* Scatter points - uniform color */}
                    <Scatter 
                      name="Workouts" 
                      data={validData}
                      fill="#8b5cf6"
                      fillOpacity={0.7}
                    />
                    
                    {/* Trend line */}
                    <Line
                      data={trendLineData}
                      type="linear"
                      dataKey="trendPower"
                      stroke={slope > 0 ? '#22c55e' : slope < 0 ? '#ef4444' : '#6b7280'}
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      dot={false}
                      legendType="none"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                
                {/* Insight text */}
                <div className="mt-4 text-center text-sm text-gray-400">
                  {slope > 0 ? (
                    <span className="text-green-400">
                      ↗ Better sleep tends to correlate with higher power output
                      <span className="text-gray-500 ml-2">
                        (+{(slope * 10).toFixed(1)}W per 10 pts of sleep score)
                      </span>
                    </span>
                  ) : slope < 0 ? (
                    <span className="text-red-400">
                      ↘ Inverse relationship detected (may need more data)
                    </span>
                  ) : (
                    <span>No clear relationship between sleep and power</span>
                  )}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Section 9: Power Curve History Heatmap */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Power Curve Progression
            </CardTitle>
            <CardDescription>
              Monthly best power at each duration (% of all-time best)
            </CardDescription>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-card-border">
            {([3, 6, 9, 12] as const).map((m) => (
              <button
                key={m}
                onClick={() => setHistoryMonths(m)}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  m !== 3 && "border-l border-card-border",
                  historyMonths === m ? 'bg-accent text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                )}
              >
                {m}mo
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {powerCurveHistory?.data && powerCurveHistory.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-gray-400 text-sm font-medium pb-3 pr-4">Month</th>
                    {powerCurveHistory.intervals.map((interval) => (
                      <th key={interval} className="text-center text-gray-400 text-sm font-medium pb-3 px-2">
                        {interval}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {powerCurveHistory.data.map((row, rowIndex) => (
                    <tr key={row.month}>
                      <td className="text-gray-300 text-sm py-2 pr-4 whitespace-nowrap">{row.label}</td>
                      {powerCurveHistory.intervals.map((interval) => {
                        const cell = row[interval];
                        if (!cell || typeof cell === 'string') {
                          return (
                            <td key={interval} className="text-center py-2 px-2">
                              <div className="w-16 h-10 rounded bg-gray-800 flex items-center justify-center">
                                <span className="text-gray-600 text-xs">—</span>
                              </div>
                            </td>
                          );
                        }
                        
                        const pct = cell.percent_of_best;
                        // Color gradient from red (low) -> yellow (mid) -> green (high/PR)
                        let bgColor = 'bg-gray-700';
                        let textColor = 'text-gray-400';
                        if (pct >= 98) {
                          bgColor = 'bg-green-600';
                          textColor = 'text-white';
                        } else if (pct >= 90) {
                          bgColor = 'bg-green-700';
                          textColor = 'text-green-100';
                        } else if (pct >= 80) {
                          bgColor = 'bg-lime-700';
                          textColor = 'text-lime-100';
                        } else if (pct >= 70) {
                          bgColor = 'bg-yellow-700';
                          textColor = 'text-yellow-100';
                        } else if (pct >= 60) {
                          bgColor = 'bg-orange-700';
                          textColor = 'text-orange-100';
                        } else {
                          bgColor = 'bg-red-900';
                          textColor = 'text-red-200';
                        }
                        
                        return (
                          <td key={interval} className="text-center py-2 px-2">
                            <div 
                              className={cn(
                                "w-16 h-10 rounded flex flex-col items-center justify-center transition-all hover:scale-105 cursor-default",
                                bgColor
                              )}
                              title={`${cell.power}W (${pct.toFixed(0)}% of best)`}
                            >
                              <span className={cn("text-xs font-medium", textColor)}>{cell.power}W</span>
                              <span className={cn("text-[10px]", textColor, "opacity-75")}>{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Legend */}
              <div className="mt-6 flex items-center justify-center gap-4 text-xs">
                <span className="text-gray-400">% of all-time best:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-red-900" />
                  <span className="text-gray-400">&lt;60%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-orange-700" />
                  <span className="text-gray-400">60-70%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-yellow-700" />
                  <span className="text-gray-400">70-80%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-lime-700" />
                  <span className="text-gray-400">80-90%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-green-700" />
                  <span className="text-gray-400">90-98%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-green-600" />
                  <span className="text-gray-400">PR Territory</span>
                </div>
              </div>
              
              {/* All-time bests reference */}
              {powerCurveHistory.all_time_best && Object.keys(powerCurveHistory.all_time_best).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-gray-400 text-sm mb-2">All-Time Bests:</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {Object.entries(powerCurveHistory.all_time_best).map(([interval, power]) => (
                      <span key={interval} className="text-gray-300">
                        <span className="text-gray-500">{interval}:</span> <span className="text-green-400 font-medium">{power}W</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              No power curve history available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
