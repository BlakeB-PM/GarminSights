import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { StatCard } from '../components/dashboard/StatCard';
import { ActivityHeatmap } from '../components/dashboard/ActivityHeatmap';
import { RecoveryScore } from '../components/dashboard/RecoveryScore';
import { ActivityBreakdown } from '../components/dashboard/ActivityBreakdown';
import { SleepStages } from '../components/dashboard/SleepStages';
import { BodyBatteryTrend } from '../components/dashboard/BodyBatteryTrend';
import { StressDistribution } from '../components/dashboard/StressDistribution';
import { TrainingLoadCard } from '../components/dashboard/TrainingLoadCard';
import { StrengthSummary } from '../components/dashboard/StrengthSummary';
import { DateRangeSelector } from '../components/dashboard/DateRangeSelector';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Moon, Battery, Footprints, Activity, Zap } from 'lucide-react';
import {
  getDashboardSummary,
  getActivityHeatmap,
  getRecoveryStatus,
  getTrainingLoad,
  getActivityBreakdown,
  getStressDistribution,
  getSleepData,
  getDailyData,
  getDailyTrend,
  getTrainingBalance,
  getSleepTrend,
  type DashboardSummary,
  type ActivityHeatmapDay,
  type RecoveryStatus,
  type TrainingLoad,
  type ActivityBreakdown as ActivityBreakdownType,
  type StressDistribution as StressDistributionData,
  type SleepData,
  type DailyData,
  type TrainingBalanceData,
} from '../lib/api';
import { formatNumber } from '../lib/utils';
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
} from 'recharts';

export function Dashboard({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  // Initialize date range to current week
  const today = new Date();
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };
  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd;
  };

  const [startDate, setStartDate] = useState(() => getWeekStart(today).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => getWeekEnd(today).toISOString().split('T')[0]);
  
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapDay[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [trainingLoad, setTrainingLoad] = useState<TrainingLoad | null>(null);
  const [activityBreakdown, setActivityBreakdown] = useState<ActivityBreakdownType | null>(null);
  const [stressDistribution, setStressDistribution] = useState<StressDistributionData | null>(null);
  const [sleepData, setSleepData] = useState<SleepData[]>([]);
  const [latestDaily, setLatestDaily] = useState<DailyData | null>(null);
  const [intensityMinutes, setIntensityMinutes] = useState<{ moderate: number; vigorous: number } | null>(null);
  const [trainingBalance, setTrainingBalance] = useState<TrainingBalanceData[]>([]);
  const [sleepTrend, setSleepTrend] = useState<Array<{ date: string; sleep_score: number; hrv_average?: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null); // Clear any previous errors
      try {
        // Calculate days for date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        const [
          summaryData,
          heatmapData,
          recoveryData,
          trainingLoadData,
          activityBreakdownData,
          stressDistributionData,
          sleepDataArray,
          dailyDataArray,
          trainingBalanceData,
          sleepTrendData,
        ] = await Promise.all([
          getDashboardSummary(startDate, endDate).catch(() => null),
          getActivityHeatmap(30).catch(() => []), // Heatmap always shows last 30 days
          getRecoveryStatus().catch(() => null), // Recovery is always current
          getTrainingLoad(startDate, endDate).catch(() => null),
          getActivityBreakdown(undefined, startDate, endDate).catch(() => null),
          getStressDistribution(undefined, startDate, endDate).catch(() => null),
          getSleepData(undefined, startDate, endDate).catch(() => []),
          getDailyData(undefined, startDate, endDate).catch(() => []),
          getTrainingBalance(12).catch(() => []), // Last 12 weeks
          getSleepTrend(30).catch(() => []), // Last 30 days for HRV
        ]);
        
        setSummary(summaryData);
        setHeatmap(heatmapData || []);
        setRecovery(recoveryData);
        setTrainingLoad(trainingLoadData);
        setActivityBreakdown(activityBreakdownData);
        setStressDistribution(stressDistributionData);
        setSleepData(sleepDataArray);
        setTrainingBalance(trainingBalanceData || []);
        setSleepTrend(sleepTrendData || []);
        
        // Get the latest daily from the filtered data (already sorted by date desc from API)
        if (dailyDataArray.length > 0) {
          // Find the most recent daily within or closest to our date range
          const latest = dailyDataArray.find(d => {
            const dDate = new Date(d.date);
            const end = new Date(endDate);
            return dDate <= end;
          }) || dailyDataArray[0];
          
          setLatestDaily(latest);
          
          // Calculate total intensity minutes across the date range
          const totalIntensity = dailyDataArray.reduce((acc, d) => {
            return {
              moderate: acc.moderate + (d.intensity_minutes_moderate || 0),
              vigorous: acc.vigorous + (d.intensity_minutes_vigorous || 0),
            };
          }, { moderate: 0, vigorous: 0 });
          
          setIntensityMinutes(totalIntensity);
        } else {
          setLatestDaily(null);
          setIntensityMinutes(null);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Could not connect to backend. Make sure the server is running.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-danger mb-2">{error}</p>
          <p className="text-gray-500 text-sm">Go to Settings to connect to Garmin and sync data.</p>
        </div>
      </div>
    );
  }

  const handleDateChange = (newStartDate: string, newEndDate: string) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <Header
        title="Dashboard"
        subtitle="Your fitness overview at a glance"
        onMenuToggle={onMenuToggle}
      />

      <DateRangeSelector
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
      />

      {/* Hero Section: Recovery Score & Training Load */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {recovery && (
          <RecoveryScore
            recoveryScore={recovery.recovery_score}
            status={recovery.status}
            message={recovery.message}
            trainingLoadRatio={trainingLoad?.load_ratio}
            sleepAverage={recovery.details?.sleep_7day_avg ?? undefined}
            bodyBattery={recovery.details?.body_battery}
            stress={recovery.details?.stress_average}
          />
        )}
        <TrainingLoadCard data={trainingLoad} loading={loading} />
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-6">
        <StatCard
          title="Sleep Score"
          value={summary?.last_sleep_score ?? '—'}
          subtitle="Last night"
          icon={<Moon className="w-5 h-5 text-accent" />}
          scoreValue={summary?.last_sleep_score ?? 0}
        />
        
        <StatCard
          title="Body Battery"
          value={summary?.last_body_battery ?? '—'}
          subtitle="Current"
          icon={<Battery className="w-5 h-5 text-accent" />}
          scoreValue={summary?.last_body_battery ?? 0}
        />
        
        <StatCard
          title="Weekly Steps"
          value={formatNumber(summary?.weekly_steps ?? 0)}
          subtitle="Last 7 days"
          icon={<Footprints className="w-5 h-5 text-accent" />}
        />
        
        <StatCard
          title="Weekly Activities"
          value={summary?.weekly_activities ?? 0}
          subtitle="Last 7 days"
          icon={<Activity className="w-5 h-5 text-accent" />}
        />
        
        <StatCard
          title="Intensity Minutes"
          value={
            intensityMinutes
              ? formatNumber(intensityMinutes.moderate + intensityMinutes.vigorous)
              : '—'
          }
          subtitle={`${startDate === endDate ? 'Today' : 'Total'}`}
          icon={<Zap className="w-5 h-5 text-accent" />}
        />
      </div>

      {/* Second Row: Activity Breakdown & Sleep Stages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <ActivityBreakdown data={activityBreakdown} loading={loading} />
        <SleepStages latestSleep={sleepData[0] || null} sleepData={sleepData} loading={loading} />
      </div>

      {/* Third Row: Body Battery Trend & Stress Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <BodyBatteryTrend latestDaily={latestDaily} loading={loading} startDate={startDate} endDate={endDate} />
        <StressDistribution data={stressDistribution} loading={loading} />
      </div>

      {/* Fourth Row: Activity Heatmap & Strength Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <ActivityHeatmap data={heatmap} days={30} />
        <StrengthSummary loading={loading} />
      </div>

      {/* Strength-Cardio Balance */}
      <Card>
        <CardHeader>
          <CardTitle>Strength-Cardio Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {trainingBalance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trainingBalance.map(week => ({
                    week: new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    strength_minutes: week.strength_minutes,
                    zone2_minutes: week.zone2_minutes,
                    vo2_minutes: week.vo2_minutes,
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="week" stroke="#6b7280" fontSize={11} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        strength_minutes: 'Strength',
                        zone2_minutes: 'Zone 2',
                        vo2_minutes: 'VO2',
                      };
                      return [`${Math.round(value)} min`, labels[name] || name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="strength_minutes" name="Strength" fill="#f97316" stackId="a" />
                  <Bar dataKey="zone2_minutes" name="Zone 2" fill="#22c55e" stackId="b" />
                  <Bar dataKey="vo2_minutes" name="VO2" fill="#ef4444" stackId="b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>No training data available. Sync your data to see charts.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sleep Score & HRV Trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sleep Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {sleepTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sleepTrend}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis stroke="#6b7280" fontSize={12} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}`, 'Sleep Score']}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <Line
                      type="monotone"
                      dataKey="sleep_score"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 3 }}
                      name="Sleep Score"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>No sleep data available.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HRV Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {sleepTrend.some(d => d.hrv_average) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sleepTrend.filter(d => d.hrv_average)}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${Math.round(value)}ms`, 'HRV']}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <Line
                      type="monotone"
                      dataKey="hrv_average"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ fill: '#22c55e', r: 3 }}
                      name="HRV"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>No HRV data available.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

