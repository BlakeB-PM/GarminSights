import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { StatCard } from '../components/dashboard/StatCard';
import { ActivityHeatmap } from '../components/dashboard/ActivityHeatmap';
import { RecoveryScore } from '../components/dashboard/RecoveryScore';
import { ActivityBreakdown } from '../components/dashboard/ActivityBreakdown';
import { SleepStages } from '../components/dashboard/SleepStages';
import { BodyBatteryTrend } from '../components/dashboard/BodyBatteryTrend';
import { StressDistribution } from '../components/dashboard/StressDistribution';
import { StrengthSummary } from '../components/dashboard/StrengthSummary';
import { DateRangeSelector } from '../components/dashboard/DateRangeSelector';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Moon, Battery, Footprints, Activity, Zap, RefreshCw, Heart } from 'lucide-react';
import {
  getDashboardSummary,
  getActivityHeatmap,
  getRecoveryStatus,
  getActivityBreakdown,
  getStressDistribution,
  getSleepData,
  getDailyData,
  getDailyTrend,
  getTrainingBalance,
  getSleepTrend,
  getLatestSleep,
  getLatestDaily,
  getSyncStatus,
  type DashboardSummary,
  type ActivityHeatmapDay,
  type RecoveryStatus,
  type ActivityBreakdown as ActivityBreakdownType,
  type StressDistribution as StressDistributionData,
  type SleepData,
  type DailyData,
  type TrainingBalanceData,
} from '../lib/api';
import { formatNumber, getDateRangeLabel, formatLastSynced } from '../lib/utils';
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

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [startDate, setStartDate] = useState(() => getWeekStart(today).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => getWeekEnd(today).toISOString().split('T')[0]);

  // ── Tier 1: "Today's Snapshot" — always live, fetched once on mount ────────
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [latestSleepSnapshot, setLatestSleepSnapshot] = useState<SleepData | null>(null);
  const [latestDailySnapshot, setLatestDailySnapshot] = useState<DailyData | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  // ── Tier 2: Period data — date-range aware, refetched when dates change ─────
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapDay[]>([]);
  const [activityBreakdown, setActivityBreakdown] = useState<ActivityBreakdownType | null>(null);
  const [stressDistribution, setStressDistribution] = useState<StressDistributionData | null>(null);
  const [sleepData, setSleepData] = useState<SleepData[]>([]);
  const [latestDaily, setLatestDaily] = useState<DailyData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [bodyBatteryTrend, setBodyBatteryTrend] = useState<Array<{ date: string; value: number }>>([]);
  const [intensityMinutes, setIntensityMinutes] = useState<{ moderate: number; vigorous: number } | null>(null);
  const [trainingBalance, setTrainingBalance] = useState<TrainingBalanceData[]>([]);
  const [sleepTrend, setSleepTrend] = useState<Array<{ date: string; sleep_score: number; hrv_average?: number | null }>>([]);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tier 1 fetch — runs once
  useEffect(() => {
    async function loadSnapshot() {
      setSnapshotLoading(true);
      try {
        const [recoveryData, latestSleepData, latestDailyData, syncStatusData] =
          await Promise.all([
            getRecoveryStatus().catch(() => null),
            getLatestSleep().catch(() => null),
            getLatestDaily().catch(() => null),
            getSyncStatus().catch(() => null),
          ]);
        setRecovery(recoveryData);
        setLatestSleepSnapshot(latestSleepData);
        setLatestDailySnapshot(latestDailyData);
        setLastSynced(syncStatusData?.last_synced ?? null);
      } catch (err) {
        console.error('Failed to load snapshot data:', err);
      } finally {
        setSnapshotLoading(false);
      }
    }
    loadSnapshot();
  }, []);

  // Tier 2 fetch — re-runs whenever the date range changes, with AbortController
  useEffect(() => {
    const controller = new AbortController();

    async function loadPeriodData() {
      setPeriodLoading(true);
      setError(null);
      try {
        const [
          summaryData,
          heatmapData,
          activityBreakdownData,
          stressDistributionData,
          sleepDataArray,
          dailyDataArray,
          batteryTrendData,
          trainingBalanceData,
          sleepTrendData,
        ] = await Promise.all([
          getDashboardSummary(startDate, endDate).catch(() => null),
          getActivityHeatmap(30).catch(() => []),
          getActivityBreakdown(undefined, startDate, endDate).catch(() => null),
          getStressDistribution(undefined, startDate, endDate).catch(() => null),
          getSleepData(undefined, startDate, endDate).catch(() => []),
          getDailyData(undefined, startDate, endDate).catch(() => []),
          getDailyTrend('body_battery_high', undefined, startDate, endDate).catch(() => []),
          getTrainingBalance(12).catch(() => []),
          getSleepTrend(30).catch(() => []),
        ]);

        if (controller.signal.aborted) return;

        setSummary(summaryData);
        setHeatmap(heatmapData || []);
        setActivityBreakdown(activityBreakdownData);
        setStressDistribution(stressDistributionData);
        setSleepData(sleepDataArray);
        setBodyBatteryTrend(batteryTrendData);
        setTrainingBalance(trainingBalanceData || []);
        setSleepTrend(sleepTrendData || []);

        setDailyData(dailyDataArray);

        if (dailyDataArray.length > 0) {
          const latest = dailyDataArray.find((d) => new Date(d.date) <= new Date(endDate)) || dailyDataArray[0];
          setLatestDaily(latest);
          const totalIntensity = dailyDataArray.reduce(
            (acc, d) => ({
              moderate: acc.moderate + (d.intensity_minutes_moderate || 0),
              vigorous: acc.vigorous + (d.intensity_minutes_vigorous || 0),
            }),
            { moderate: 0, vigorous: 0 },
          );
          setIntensityMinutes(totalIntensity);
        } else {
          setLatestDaily(null);
          setIntensityMinutes(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to load period data:', err);
          setError('Could not connect to backend. Make sure the server is running.');
        }
      } finally {
        if (!controller.signal.aborted) setPeriodLoading(false);
      }
    }

    loadPeriodData();
    return () => controller.abort();
  }, [startDate, endDate]);

  if (error && !summary && !periodLoading) {
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

  const rangeLabel = getDateRangeLabel(startDate, endDate);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <Header
        title="Dashboard"
        subtitle="Your fitness overview at a glance"
        onMenuToggle={onMenuToggle}
      />

      {/* ── Section 1: Today's Snapshot (always live, ignores date range) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Today's Snapshot
          </h2>
          {lastSynced && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw className="w-3 h-3" />
              {formatLastSynced(lastSynced)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title="Recovery"
            value={recovery?.recovery_score ?? '—'}
            subtitle={recovery?.status ? recovery.status.charAt(0).toUpperCase() + recovery.status.slice(1) : 'Loading…'}
            icon={<Activity className="w-5 h-5 text-accent" />}
            scoreValue={recovery?.recovery_score ?? 0}
          />
          <StatCard
            title="Body Battery"
            value={latestDailySnapshot?.body_battery_high ?? '—'}
            subtitle={
              latestDailySnapshot?.date === todayStr
                ? "Today's peak"
                : latestDailySnapshot?.date
                ? `Peak ${new Date(latestDailySnapshot.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : "Today's peak"
            }
            icon={<Battery className="w-5 h-5 text-accent" />}
            scoreValue={latestDailySnapshot?.body_battery_high ?? 0}
          />
          <StatCard
            title="Sleep Score"
            value={latestSleepSnapshot?.sleep_score ?? '—'}
            subtitle={
              latestSleepSnapshot
                ? `${((latestSleepSnapshot.total_sleep_seconds ?? 0) / 3600).toFixed(1)}h last night`
                : 'Last night'
            }
            icon={<Moon className="w-5 h-5 text-accent" />}
            scoreValue={latestSleepSnapshot?.sleep_score ?? 0}
          />
          <StatCard
            title="HRV"
            value={
              latestSleepSnapshot?.hrv_average
                ? `${Math.round(latestSleepSnapshot.hrv_average)}ms`
                : '—'
            }
            subtitle="Last night"
            icon={<Heart className="w-5 h-5 text-accent" />}
          />
        </div>

        {recovery && (
          <RecoveryScore
            recoveryScore={recovery.recovery_score}
            status={recovery.status}
            message={recovery.message}
            sleepAverage={recovery.details?.sleep_7day_avg ?? undefined}
            bodyBattery={recovery.details?.body_battery}
            stress={recovery.details?.stress_average}
          />
        )}
      </div>

      {/* ── Section 2: Date Range Selector ── */}
      <DateRangeSelector
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
      />

      {/* ── Section 3: Period Stats (date-range aware) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
        <StatCard
          title="Steps"
          value={formatNumber(summary?.weekly_steps ?? 0)}
          subtitle={rangeLabel}
          icon={<Footprints className="w-5 h-5 text-accent" />}
        />
        <StatCard
          title="Activities"
          value={summary?.weekly_activities ?? '—'}
          subtitle={rangeLabel}
          icon={<Activity className="w-5 h-5 text-accent" />}
        />
        <StatCard
          title="Avg Sleep"
          value={
            sleepData.length > 0
              ? Math.round(
                  sleepData.reduce((acc, s) => acc + (s.sleep_score ?? 0), 0) /
                    sleepData.filter((s) => s.sleep_score != null).length || 1,
                )
              : '—'
          }
          subtitle={`${sleepData.filter((s) => s.sleep_score != null).length} nights`}
          icon={<Moon className="w-5 h-5 text-accent" />}
          scoreValue={
            sleepData.length > 0
              ? Math.round(
                  sleepData.reduce((acc, s) => acc + (s.sleep_score ?? 0), 0) /
                    (sleepData.filter((s) => s.sleep_score != null).length || 1),
                )
              : 0
          }
        />
        <StatCard
          title="Intensity Min"
          value={
            intensityMinutes
              ? formatNumber(intensityMinutes.moderate + intensityMinutes.vigorous)
              : '—'
          }
          subtitle={rangeLabel}
          icon={<Zap className="w-5 h-5 text-accent" />}
        />
        <StatCard
          title="Avg Body Batt"
          value={
            latestDaily?.body_battery_high ?? '—'
          }
          subtitle="Most recent day"
          icon={<Battery className="w-5 h-5 text-accent" />}
          scoreValue={latestDaily?.body_battery_high ?? 0}
        />
      </div>

      {/* ── Section 4: Trends (date-range aware) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <ActivityBreakdown data={activityBreakdown} loading={periodLoading} />
        <SleepStages latestSleep={latestSleepSnapshot || sleepData[0] || null} sleepData={sleepData} loading={periodLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <BodyBatteryTrend
          latestDaily={latestDailySnapshot}
          trendData={bodyBatteryTrend}
          loading={periodLoading}
        />
        <StressDistribution data={stressDistribution} dailyData={dailyData} loading={periodLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <StrengthSummary loading={periodLoading} />
        {/* Activity Heatmap — always last 30 days, labeled */}
        <div>
          <ActivityHeatmap data={heatmap} days={30} />
        </div>
      </div>

      {/* ── Section 5: Long-Term Views (fixed windows, clearly labeled) ── */}
      <Card>
        <CardHeader>
          <CardTitle>Strength-Cardio Balance</CardTitle>
          <CardDescription>Last 12 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {periodLoading ? (
              <div className="h-full animate-pulse bg-gray-800 rounded-lg" />
            ) : trainingBalance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trainingBalance.map((week) => ({
                    week: new Date(week.week_start + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }),
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sleep Score Trend</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {periodLoading ? (
                <div className="h-full animate-pulse bg-gray-800 rounded-lg" />
              ) : sleepTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sleepTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(value) =>
                        new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    <YAxis stroke="#6b7280" fontSize={12} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}`, 'Sleep Score']}
                      labelFormatter={(label) =>
                        new Date(label + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
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
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {periodLoading ? (
                <div className="h-full animate-pulse bg-gray-800 rounded-lg" />
              ) : sleepTrend.some((d) => d.hrv_average) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sleepTrend.filter((d) => d.hrv_average)}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(value) =>
                        new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${Math.round(value)}ms`, 'HRV']}
                      labelFormatter={(label) =>
                        new Date(label + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
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
