import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  X, 
  Moon, 
  Footprints, 
  Activity,
  Heart,
  Battery,
  Flame,
  Clock,
  TrendingUp,
  Wind,
  Gauge
} from 'lucide-react';
import { 
  getSleepData, 
  getDailyData, 
  getActivities,
  getActivityDetails,
  type SleepData,
  type DailyData,
  type Activity as ActivityType
} from '../lib/api';
import { ActivityDetailView } from '../components/activities/ActivityDetailView';
import { formatDuration, cn, formatDistanceDual } from '../lib/utils';

interface DayRecord {
  date: string;
  sleep: SleepData | null;
  daily: DailyData | null;
  activities: ActivityType[];
}

export function DataViewer({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayRecord | null>(null);
  const [daysToShow, setDaysToShow] = useState(14);
  const [activityDetails, setActivityDetails] = useState<Record<number, ActivityType>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, [daysToShow]);

  // Load activity details for all activities when day is selected
  useEffect(() => {
    if (!selectedDay || selectedDay.activities.length === 0) {
      setActivityDetails({});
      setLoadingDetails(new Set());
      return;
    }
    
    // Clear previous loading state
    setLoadingDetails(new Set());
    
    // Load details for all activities in parallel
    const activityIds = selectedDay.activities.map(a => a.id);
    const loadPromises = activityIds.map(async (activityId) => {
      // Mark as loading
      setLoadingDetails(prev => new Set([...prev, activityId]));
      
      try {
        const details = await getActivityDetails(activityId);
        setActivityDetails(prev => ({ ...prev, [activityId]: details }));
      } catch (error) {
        console.error(`Failed to load details for activity ${activityId}:`, error);
      } finally {
        setLoadingDetails(prev => {
          const next = new Set(prev);
          next.delete(activityId);
          return next;
        });
      }
    });
    
    // Execute all loads in parallel
    Promise.all(loadPromises).catch(error => {
      console.error('Error loading activity details:', error);
    });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay?.date]); // Only depend on the date, not the entire selectedDay object

  async function loadData() {
    setLoading(true);
    try {
      // Calculate date range for activities
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - daysToShow);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];

      // Increase activity limit for longer date ranges
      const activityLimit = daysToShow > 60 ? 1000 : 200;
      
      const [sleepData, dailyData, activityData] = await Promise.all([
        getSleepData(daysToShow).catch(() => []),
        getDailyData(daysToShow).catch(() => []),
        getActivities({ limit: activityLimit, start_date: startDateStr, end_date: endDateStr }).catch(() => []),
      ]);

      // Create a map of dates to records
      const recordMap = new Map<string, DayRecord>();

      // Get the last N days
      for (let i = 0; i < daysToShow; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        recordMap.set(dateStr, {
          date: dateStr,
          sleep: null,
          daily: null,
          activities: [],
        });
      }

      // Fill in sleep data
      for (const sleep of sleepData) {
        const dateStr = sleep.date;
        if (recordMap.has(dateStr)) {
          recordMap.get(dateStr)!.sleep = sleep;
        }
      }

      // Fill in daily data
      for (const daily of dailyData) {
        const dateStr = daily.date;
        if (recordMap.has(dateStr)) {
          recordMap.get(dateStr)!.daily = daily;
        }
      }

      // Fill in activities - handle both datetime and date-only formats
      for (const activity of activityData) {
        if (!activity.start_time) continue;
        
        // Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss" formats
        const dateStr = activity.start_time.includes('T') 
          ? activity.start_time.split('T')[0]
          : activity.start_time.substring(0, 10);
        
        if (dateStr && recordMap.has(dateStr)) {
          recordMap.get(dateStr)!.activities.push(activity);
        }
      }

      // Convert to sorted array
      const sortedRecords = Array.from(recordMap.values()).sort(
        (a, b) => b.date.localeCompare(a.date)
      );

      setRecords(sortedRecords);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatHours = (seconds: number | null | undefined) => {
    if (!seconds) return '—';
    const hours = seconds / 3600;
    return `${hours.toFixed(1)}h`;
  };

  const formatMinutes = (seconds: number | null | undefined) => {
    if (!seconds) return '—';
    return `${Math.round(seconds / 60)}m`;
  };

  const getDataStatus = (record: DayRecord) => {
    const hasSleep = record.sleep !== null;
    const hasDaily = record.daily !== null;
    const hasActivities = record.activities.length > 0;
    
    if (hasSleep && hasDaily) return 'complete';
    if (hasSleep || hasDaily || hasActivities) return 'partial';
    return 'missing';
  };

  const statusColors = {
    complete: 'bg-success/20 text-success',
    partial: 'bg-warning/20 text-warning',
    missing: 'bg-gray-700/20 text-gray-500',
  };

  // Calculate total activity calories for a day
  const getActivityCalories = (activities: ActivityType[]) => {
    return activities.reduce((sum, a) => sum + (a.calories || 0), 0);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <Header
        title="Data Viewer"
        subtitle="Verify your imported data day-by-day"
        onMenuToggle={onMenuToggle}
      />

      {/* Controls */}
      <Card>
        <CardContent className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-gray-400">Show last:</span>
            {[7, 14, 30, 60, 180, 365].map((days) => {
              let label = `${days} days`;
              if (days === 180) label = '6 months';
              if (days === 365) label = '1 year';
              
              return (
                <Button
                  key={days}
                  variant={daysToShow === days ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setDaysToShow(days)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-success/50" />
              Complete
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-warning/50" />
              Partial
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-600" />
              No Data
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-3 px-3 text-gray-400 font-medium sticky left-0 bg-card">Date</th>
                    <th className="text-center py-3 px-2 text-gray-400 font-medium">Status</th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Steps">
                      <Footprints className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Total Calories">
                      <Flame className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Activity Calories">
                      Act Cal
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Sleep Hours">
                      <Moon className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Sleep Score">
                      Score
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Body Battery">
                      <Battery className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Resting Heart Rate">
                      <Heart className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="HRV">
                      HRV
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Stress">
                      <Gauge className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Intensity Minutes">
                      <TrendingUp className="w-4 h-4 inline" />
                    </th>
                    <th className="text-right py-3 px-2 text-gray-400 font-medium" title="Activities">
                      <Activity className="w-4 h-4 inline" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const status = getDataStatus(record);
                    const intensityMins = (record.daily?.intensity_minutes_moderate || 0) + 
                                         (record.daily?.intensity_minutes_vigorous || 0) * 2;
                    return (
                      <tr 
                        key={record.date} 
                        className="border-b border-card-border/50 hover:bg-card/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedDay(record)}
                      >
                        <td className="py-2 px-3 font-medium sticky left-0 bg-card">{formatDate(record.date)}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            statusColors[status]
                          )}>
                            {status === 'complete' ? '✓' : status === 'partial' ? '~' : '—'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.steps?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.calories_total?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.active_calories?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatHours(record.sleep?.total_sleep_seconds)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.sleep?.sleep_score ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.body_battery_high ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.resting_heart_rate || record.sleep?.resting_hr || '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.sleep?.hrv_average?.toFixed(0) ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {record.daily?.stress_average ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {intensityMins > 0 ? intensityMins : '—'}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {record.activities.length > 0 ? (
                            <span className="text-accent font-medium">{record.activities.length}</span>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {records.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>No data found</p>
                  <p className="text-sm mt-1">Sync your Garmin data to see records here</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-card-border rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-card-border">
              <h2 className="text-xl font-semibold">
                {formatDate(selectedDay.date)}
              </h2>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-card-border rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-4rem)] space-y-6">
              
              {/* Daily Metrics Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Footprints className="w-5 h-5 text-accent" />
                  Daily Metrics
                </h3>
                {selectedDay.daily ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataItem label="Steps" value={selectedDay.daily.steps?.toLocaleString()} />
                    <DataItem label="Distance" value={formatDistanceDual(selectedDay.daily.distance_meters)} />
                    <DataItem label="Total Calories" value={selectedDay.daily.calories_total?.toLocaleString()} />
                    <DataItem label="Active Calories" value={selectedDay.daily.active_calories?.toLocaleString()} />
                    <DataItem label="BMR Calories" value={selectedDay.daily.calories_bmr?.toLocaleString()} />
                  </div>
                ) : (
                  <p className="text-gray-500">No daily metrics for this day</p>
                )}
              </div>

              {/* Body Battery & Stress Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Battery className="w-5 h-5 text-accent" />
                  Body Battery & Stress
                </h3>
                {selectedDay.daily ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataItem label="Battery High" value={selectedDay.daily.body_battery_high} />
                    <DataItem label="Battery Low" value={selectedDay.daily.body_battery_low} />
                    <DataItem label="Charged" value={selectedDay.daily.body_battery_charged} />
                    <DataItem label="Drained" value={selectedDay.daily.body_battery_drained} />
                    <DataItem label="Stress Avg" value={selectedDay.daily.stress_average} />
                    <DataItem label="Stress High" value={selectedDay.daily.stress_high} />
                    <DataItem label="Low Stress" value={formatMinutes(selectedDay.daily.low_stress_duration)} />
                    <DataItem label="Medium Stress" value={formatMinutes(selectedDay.daily.medium_stress_duration)} />
                    <DataItem label="High Stress" value={formatMinutes(selectedDay.daily.high_stress_duration)} />
                    <DataItem label="Rest Stress" value={formatMinutes(selectedDay.daily.rest_stress_duration)} />
                    <DataItem label="Activity Stress" value={formatMinutes(selectedDay.daily.activity_stress_duration)} />
                  </div>
                ) : (
                  <p className="text-gray-500">No body battery data for this day</p>
                )}
              </div>

              {/* Heart Rate & Health Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Heart className="w-5 h-5 text-accent" />
                  Heart Rate & Health
                </h3>
                {selectedDay.daily ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataItem label="Resting HR" value={selectedDay.daily.resting_heart_rate ? `${selectedDay.daily.resting_heart_rate} bpm` : null} />
                    <DataItem label="Avg HR" value={selectedDay.daily.avg_heart_rate ? `${selectedDay.daily.avg_heart_rate} bpm` : null} />
                    <DataItem label="Max HR" value={selectedDay.daily.max_heart_rate ? `${selectedDay.daily.max_heart_rate} bpm` : null} />
                    <DataItem label="Min HR" value={selectedDay.daily.min_heart_rate ? `${selectedDay.daily.min_heart_rate} bpm` : null} />
                    <DataItem label="Intensity Moderate" value={selectedDay.daily.intensity_minutes_moderate ? `${selectedDay.daily.intensity_minutes_moderate} min` : null} />
                    <DataItem label="Intensity Vigorous" value={selectedDay.daily.intensity_minutes_vigorous ? `${selectedDay.daily.intensity_minutes_vigorous} min` : null} />
                  </div>
                ) : (
                  <p className="text-gray-500">No heart rate data for this day</p>
                )}
              </div>

              {/* Sleep Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Moon className="w-5 h-5 text-accent" />
                  Sleep Data
                </h3>
                {selectedDay.sleep ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataItem label="Sleep Score" value={selectedDay.sleep.sleep_score} />
                    <DataItem label="Total Sleep" value={formatHours(selectedDay.sleep.total_sleep_seconds)} />
                    <DataItem label="Deep Sleep" value={formatHours(selectedDay.sleep.deep_sleep_seconds)} />
                    <DataItem label="Light Sleep" value={formatHours(selectedDay.sleep.light_sleep_seconds)} />
                    <DataItem label="REM Sleep" value={formatHours(selectedDay.sleep.rem_sleep_seconds)} />
                    <DataItem label="Awake" value={formatHours(selectedDay.sleep.awake_seconds)} />
                    <DataItem label="HRV" value={selectedDay.sleep.hrv_average ? `${selectedDay.sleep.hrv_average.toFixed(0)} ms` : null} />
                    <DataItem label="Resting HR" value={selectedDay.sleep.resting_hr ? `${selectedDay.sleep.resting_hr} bpm` : null} />
                  </div>
                ) : (
                  <p className="text-gray-500">No sleep data for this day</p>
                )}
              </div>

              {/* Activities Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Activity className="w-5 h-5 text-accent" />
                  Activities ({selectedDay.activities.length})
                </h3>
                {selectedDay.activities.length > 0 ? (
                  <div className="space-y-6">
                    {selectedDay.activities.map((activity) => {
                      const details = activityDetails[activity.id];
                      const isLoading = loadingDetails.has(activity.id);
                      
                      return (
                        <div 
                          key={activity.id}
                          className="p-4 bg-background rounded-lg border border-card-border"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <span className="font-medium text-lg">
                              {activity.name || activity.activity_type?.replace(/_/g, ' ')}
                            </span>
                            <span className="text-sm text-gray-400 capitalize px-2 py-1 bg-card rounded">
                              {activity.activity_type?.replace(/_/g, ' ')}
                            </span>
                          </div>
                          
                          {isLoading ? (
                            <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
                              <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
                              <span>Loading activity details...</span>
                            </div>
                          ) : details ? (
                            <ActivityDetailView activity={details} />
                          ) : (
                            <div className="text-gray-500 text-sm">
                              No activity details available
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500">No activities for this day</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="p-3 bg-background rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-mono">{value ?? '—'}</p>
    </div>
  );
}
