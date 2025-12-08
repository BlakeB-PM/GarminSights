import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Moon, 
  Footprints, 
  Activity,
  Heart,
  Battery,
  Brain,
  Dumbbell,
  Clock
} from 'lucide-react';
import { 
  getSleepData, 
  getDailyData, 
  getActivities,
  type SleepData,
  type DailyData,
  type Activity as ActivityType
} from '../lib/api';
import { formatDuration, cn } from '../lib/utils';

interface DayRecord {
  date: string;
  sleep: SleepData | null;
  daily: DailyData | null;
  activities: ActivityType[];
}

export function DataViewer() {
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayRecord | null>(null);
  const [daysToShow, setDaysToShow] = useState(14);

  useEffect(() => {
    loadData();
  }, [daysToShow]);

  async function loadData() {
    setLoading(true);
    try {
      const [sleepData, dailyData, activityData] = await Promise.all([
        getSleepData(daysToShow).catch(() => []),
        getDailyData(daysToShow).catch(() => []),
        getActivities({ limit: 100 }).catch(() => []),
      ]);

      // Create a map of dates to records
      const recordMap = new Map<string, DayRecord>();

      // Get the last N days
      const today = new Date();
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

      // Fill in activities
      for (const activity of activityData) {
        const dateStr = activity.start_time?.split('T')[0];
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

  const formatHours = (seconds: number | null) => {
    if (!seconds) return '—';
    const hours = seconds / 3600;
    return `${hours.toFixed(1)}h`;
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

  return (
    <div className="space-y-6 animate-fade-in">
      <Header
        title="Data Viewer"
        subtitle="Verify your imported data day-by-day"
      />

      {/* Controls */}
      <Card>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Show last:</span>
            {[7, 14, 30, 60].map((days) => (
              <Button
                key={days}
                variant={daysToShow === days ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDaysToShow(days)}
              >
                {days} days
              </Button>
            ))}
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Footprints className="w-4 h-4" /> Steps
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Moon className="w-4 h-4" /> Sleep
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Moon className="w-4 h-4" /> Score
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Battery className="w-4 h-4" /> Battery
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Heart className="w-4 h-4" /> RHR
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Activity className="w-4 h-4" /> Activities
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const status = getDataStatus(record);
                    return (
                      <tr 
                        key={record.date} 
                        className="border-b border-card-border/50 hover:bg-card/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedDay(record)}
                      >
                        <td className="py-3 px-4 font-medium">{formatDate(record.date)}</td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium capitalize',
                            statusColors[status]
                          )}>
                            {status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {record.daily?.steps?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {formatHours(record.sleep?.total_sleep_seconds ?? null)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {record.sleep?.sleep_score ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {record.daily?.body_battery_high ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {record.sleep?.resting_hr ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {record.activities.length > 0 ? (
                            <span className="text-accent">{record.activities.length}</span>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <ChevronRight className="w-4 h-4 text-gray-500" />
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
          <div className="bg-card border border-card-border rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
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
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)] space-y-6">
              {/* Sleep Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Moon className="w-5 h-5 text-accent" />
                  Sleep Data
                </h3>
                {selectedDay.sleep ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <DataItem label="Sleep Score" value={selectedDay.sleep.sleep_score} />
                    <DataItem label="Total Sleep" value={formatHours(selectedDay.sleep.total_sleep_seconds)} />
                    <DataItem label="Deep Sleep" value={formatHours(selectedDay.sleep.deep_sleep_seconds)} />
                    <DataItem label="Light Sleep" value={formatHours(selectedDay.sleep.light_sleep_seconds)} />
                    <DataItem label="REM Sleep" value={formatHours(selectedDay.sleep.rem_sleep_seconds)} />
                    <DataItem label="Awake" value={formatHours(selectedDay.sleep.awake_seconds)} />
                    <DataItem label="HRV" value={selectedDay.sleep.hrv_average ? `${selectedDay.sleep.hrv_average.toFixed(0)} ms` : '—'} />
                    <DataItem label="Resting HR" value={selectedDay.sleep.resting_hr ? `${selectedDay.sleep.resting_hr} bpm` : '—'} />
                  </div>
                ) : (
                  <p className="text-gray-500">No sleep data for this day</p>
                )}
              </div>

              {/* Daily Metrics Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Footprints className="w-5 h-5 text-accent" />
                  Daily Metrics
                </h3>
                {selectedDay.daily ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <DataItem label="Steps" value={selectedDay.daily.steps?.toLocaleString() ?? '—'} />
                    <DataItem label="Body Battery High" value={selectedDay.daily.body_battery_high ?? '—'} />
                    <DataItem label="Body Battery Low" value={selectedDay.daily.body_battery_low ?? '—'} />
                    <DataItem label="Stress Avg" value={selectedDay.daily.stress_average ?? '—'} />
                    <DataItem label="Calories" value={selectedDay.daily.calories_total?.toLocaleString() ?? '—'} />
                  </div>
                ) : (
                  <p className="text-gray-500">No daily metrics for this day</p>
                )}
              </div>

              {/* Activities Section */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-medium mb-3">
                  <Activity className="w-5 h-5 text-accent" />
                  Activities ({selectedDay.activities.length})
                </h3>
                {selectedDay.activities.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDay.activities.map((activity) => (
                      <div 
                        key={activity.id}
                        className="p-3 bg-background rounded-lg border border-card-border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {activity.name || activity.activity_type?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm text-gray-400">
                            {activity.activity_type?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDuration(activity.duration_seconds)}
                          </span>
                          {activity.calories > 0 && (
                            <span>{activity.calories} cal</span>
                          )}
                          {activity.distance_meters > 0 && (
                            <span>{(activity.distance_meters / 1000).toFixed(2)} km</span>
                          )}
                        </div>
                      </div>
                    ))}
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

function DataItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="p-3 bg-background rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-mono">{value ?? '—'}</p>
    </div>
  );
}

