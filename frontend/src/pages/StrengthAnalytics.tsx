import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { MultiSelect } from '../components/ui/MultiSelect';
import { TimeFrameSelector } from '../components/strength/TimeFrameSelector';
import { Dumbbell, TrendingUp, Target, Weight } from 'lucide-react';
import {
  getExercises,
  getExerciseProgress,
  getPersonalRecords,
  getMuscleGroupVolume,
  getKeyLifts,
  getTrainingBalance,
  getTrainingFrequency,
  getVolumeTrends,
  getMuscleComparison,
  getDrillDownData,
  type ExerciseProgress,
  type KeyLiftCard,
  type TrainingBalanceData,
  type MuscleFrequency,
  type VolumeTrendData,
  type MuscleComparisonData,
  type DrillDownResponse,
} from '../lib/api';
import { formatWeightDual, formatVolumeDual, formatDate, cn } from '../lib/utils';
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
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Activity, TrendingUp as TrendingUpIcon, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Drawer } from '../components/ui/Drawer';
import { DrillDownContent } from '../components/strength/DrillDownContent';

export function StrengthAnalytics() {
  const [exercises, setExercises] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [progress, setProgress] = useState<ExerciseProgress[]>([]);
  const [prs, setPrs] = useState<Array<{ exercise_name: string; estimated_1rm: number; max_weight_lifted: number; date_achieved: string }>>([]);
  const [muscleVolume, setMuscleVolume] = useState<Record<string, { volume: number; sets: number; exercises: string[] }>>({});
  const [loading, setLoading] = useState(true);
  
  // New views state
  const [keyLifts, setKeyLifts] = useState<KeyLiftCard[]>([]);
  const [trainingBalance, setTrainingBalance] = useState<TrainingBalanceData[]>([]);
  const [trainingFrequency, setTrainingFrequency] = useState<MuscleFrequency[]>([]);
  const [volumeTrends, setVolumeTrends] = useState<VolumeTrendData[]>([]);
  const [muscleComparison, setMuscleComparison] = useState<MuscleComparisonData[]>([]);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(['Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps', 'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves']);
  const [comparisonViewMode, setComparisonViewMode] = useState<'individual' | 'upperLower' | 'bodyRegions'>('individual');
  const [frequencySortBy, setFrequencySortBy] = useState<'frequency' | 'days_since' | 'volume' | 'alphabetical'>('frequency');
  const [trainingBalanceTab, setTrainingBalanceTab] = useState<'sessions' | 'minutes'>('sessions');
  
  // Muscle group mappings for aggregated views
  const UPPER_BODY_GROUPS = ['Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps', 'Abs'];
  const LOWER_BODY_GROUPS = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
  const ALL_MUSCLE_GROUPS = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Biceps', 'Triceps', 'Shoulders', 'Glutes', 'Abs', 'Calves'];
  
  // Time frame state management
  const [volumeTrendsWeeks, setVolumeTrendsWeeks] = useState<4 | 8 | 12 | 16 | 24 | 52>(12);
  const [volumeTrendsMuscleGroup, setVolumeTrendsMuscleGroup] = useState<string>('Total');
  const [trainingBalanceWeeks, setTrainingBalanceWeeks] = useState<4 | 8 | 12 | 16 | 24 | 52>(12);
  const [trainingFrequencyWeeks, setTrainingFrequencyWeeks] = useState<4 | 8 | 12 | 16 | 24 | 52>(12);
  const [muscleComparisonWeeks, setMuscleComparisonWeeks] = useState<4 | 8 | 12 | 16 | 24 | 52>(12);
  const [muscleVolumeDays, setMuscleVolumeDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [exerciseProgressDays, setExerciseProgressDays] = useState<7 | 14 | 30 | 60 | 90>(90);
  
  // Individual loading and error states
  const [loadingStates, setLoadingStates] = useState({
    exercises: true,
    prs: true,
    muscleVolume: true,
    keyLifts: true,
    trainingBalance: true,
    trainingFrequency: true,
    volumeTrends: true,
    muscleComparison: false,
    progress: false,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Drill-down state
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState<DrillDownResponse | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownTabs, setDrillDownTabs] = useState<Array<{ label: string; filter: any }>>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [drillDownTitle, setDrillDownTitle] = useState('');

  // Helper function to aggregate muscle comparison data based on view mode
  const aggregateMuscleComparison = (
    data: MuscleComparisonData[],
    viewMode: 'individual' | 'upperLower' | 'bodyRegions'
  ): MuscleComparisonData[] => {
    if (viewMode === 'individual') {
      return data;
    }

    return data.map(week => {
      const aggregated: MuscleComparisonData = {
        week_start: week.week_start,
        week_end: week.week_end,
        muscle_groups: {},
      };

      if (viewMode === 'upperLower') {
        // Aggregate upper body
        aggregated.muscle_groups['Upper Body'] = UPPER_BODY_GROUPS.reduce(
          (sum, group) => sum + (week.muscle_groups[group] || 0),
          0
        );
        // Aggregate lower body
        aggregated.muscle_groups['Lower Body'] = LOWER_BODY_GROUPS.reduce(
          (sum, group) => sum + (week.muscle_groups[group] || 0),
          0
        );
      } else if (viewMode === 'bodyRegions') {
        // Aggregate by body regions
        aggregated.muscle_groups['Arms'] = ['Biceps', 'Triceps'].reduce(
          (sum, group) => sum + (week.muscle_groups[group] || 0),
          0
        );
        aggregated.muscle_groups['Chest'] = week.muscle_groups['Chest'] || 0;
        aggregated.muscle_groups['Back'] = week.muscle_groups['Back'] || 0;
        aggregated.muscle_groups['Legs'] = LOWER_BODY_GROUPS.reduce(
          (sum, group) => sum + (week.muscle_groups[group] || 0),
          0
        );
      }

      return aggregated;
    });
  };

  // Auto-select muscle groups when view mode changes
  useEffect(() => {
    if (comparisonViewMode === 'individual') {
      // Keep current selection or default to all groups
      if (selectedMuscles.length < 2) {
        setSelectedMuscles(ALL_MUSCLE_GROUPS);
      }
    } else if (comparisonViewMode === 'upperLower') {
      // Select all upper + lower groups to fetch all data
      setSelectedMuscles([...UPPER_BODY_GROUPS, ...LOWER_BODY_GROUPS]);
    } else if (comparisonViewMode === 'bodyRegions') {
      // Select all groups needed for regions
      setSelectedMuscles(ALL_MUSCLE_GROUPS);
    }
  }, [comparisonViewMode]);

  // Load exercises list and initial data (non-time-frame dependent)
  useEffect(() => {
    async function load() {
      const keys = ['exercises', 'prs', 'keyLifts'];
      const promises = [
        getExercises(),
        getPersonalRecords(),
        getKeyLifts(),
      ];
      
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        const key = keys[index];
        
        if (result.status === 'fulfilled') {
          const data = result.value;
          switch (key) {
            case 'exercises':
              setExercises(data.exercises || []);
              if (data.exercises && data.exercises.length > 0) {
                setSelectedExercise(data.exercises[0]);
              }
              break;
            case 'prs':
              setPrs(Array.isArray(data) ? data : []);
              break;
            case 'keyLifts':
              setKeyLifts(Array.isArray(data) ? data : []);
              break;
          }
          setLoadingStates(prev => ({ ...prev, [key]: false }));
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[key];
            return newErrors;
          });
        } else {
          console.error(`Failed to load ${key}:`, result.reason);
          setLoadingStates(prev => ({ ...prev, [key]: false }));
          setErrors(prev => ({ ...prev, [key]: `Failed to load ${key}. Please try refreshing.` }));
        }
      });
      
      setLoading(false);
    }
    load();
  }, []);

  // Load muscle volume (days-based)
  useEffect(() => {
    setLoadingStates(prev => ({ ...prev, muscleVolume: true }));
    getMuscleGroupVolume(muscleVolumeDays)
      .then(data => {
        setMuscleVolume(data || {});
        setLoadingStates(prev => ({ ...prev, muscleVolume: false }));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.muscleVolume;
          return newErrors;
        });
      })
      .catch(error => {
        console.error('Failed to load muscle volume:', error);
        setLoadingStates(prev => ({ ...prev, muscleVolume: false }));
        setErrors(prev => ({ ...prev, muscleVolume: 'Failed to load muscle volume data.' }));
      });
  }, [muscleVolumeDays]);

  // Load training balance (weeks-based)
  useEffect(() => {
    setLoadingStates(prev => ({ ...prev, trainingBalance: true }));
    getTrainingBalance(trainingBalanceWeeks)
      .then(data => {
        setTrainingBalance(Array.isArray(data) ? data : []);
        setLoadingStates(prev => ({ ...prev, trainingBalance: false }));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.trainingBalance;
          return newErrors;
        });
      })
      .catch(error => {
        console.error('Failed to load training balance:', error);
        setLoadingStates(prev => ({ ...prev, trainingBalance: false }));
        setErrors(prev => ({ ...prev, trainingBalance: 'Failed to load training balance data.' }));
      });
  }, [trainingBalanceWeeks]);

  // Load volume trends (weeks-based)
  useEffect(() => {
    setLoadingStates(prev => ({ ...prev, volumeTrends: true }));
    getVolumeTrends(volumeTrendsWeeks, volumeTrendsMuscleGroup === 'Total' ? undefined : volumeTrendsMuscleGroup)
      .then(data => {
        setVolumeTrends(Array.isArray(data) ? data : []);
        setLoadingStates(prev => ({ ...prev, volumeTrends: false }));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.volumeTrends;
          return newErrors;
        });
      })
      .catch(error => {
        console.error('Failed to load volume trends:', error);
        setLoadingStates(prev => ({ ...prev, volumeTrends: false }));
        setErrors(prev => ({ ...prev, volumeTrends: 'Failed to load volume trends data.' }));
      });
  }, [volumeTrendsWeeks, volumeTrendsMuscleGroup]);
  
  // Load muscle comparison when selected muscles or weeks change
  useEffect(() => {
    if (selectedMuscles.length >= 2) {
      setLoadingStates(prev => ({ ...prev, muscleComparison: true }));
      getMuscleComparison(selectedMuscles, muscleComparisonWeeks)
        .then(data => {
          setMuscleComparison(Array.isArray(data) ? data : []);
          setLoadingStates(prev => ({ ...prev, muscleComparison: false }));
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.muscleComparison;
            return newErrors;
          });
        })
        .catch(error => {
          console.error('Failed to load muscle comparison:', error);
          setLoadingStates(prev => ({ ...prev, muscleComparison: false }));
          setErrors(prev => ({ ...prev, muscleComparison: 'Failed to load comparison data.' }));
        });
    } else {
      setMuscleComparison([]);
    }
  }, [selectedMuscles, muscleComparisonWeeks]);
  
  // Reload frequency when sort or weeks change
  useEffect(() => {
    setLoadingStates(prev => ({ ...prev, trainingFrequency: true }));
    getTrainingFrequency(trainingFrequencyWeeks, frequencySortBy)
      .then(data => {
        setTrainingFrequency(Array.isArray(data) ? data : []);
        setLoadingStates(prev => ({ ...prev, trainingFrequency: false }));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.trainingFrequency;
          return newErrors;
        });
      })
      .catch(error => {
        console.error('Failed to load training frequency:', error);
        setLoadingStates(prev => ({ ...prev, trainingFrequency: false }));
        setErrors(prev => ({ ...prev, trainingFrequency: 'Failed to load frequency data.' }));
      });
  }, [frequencySortBy, trainingFrequencyWeeks]);
  
  // Load progress for selected exercise
  useEffect(() => {
    if (!selectedExercise) {
      setProgress([]);
      return;
    }
    
    setLoadingStates(prev => ({ ...prev, progress: true }));
    getExerciseProgress(selectedExercise, exerciseProgressDays)
      .then(data => {
        setProgress(Array.isArray(data) ? data : []);
        setLoadingStates(prev => ({ ...prev, progress: false }));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.progress;
          return newErrors;
        });
      })
      .catch(error => {
        console.error('Failed to load progress:', error);
        setLoadingStates(prev => ({ ...prev, progress: false }));
        setErrors(prev => ({ ...prev, progress: 'Failed to load exercise progress.' }));
      });
  }, [selectedExercise, exerciseProgressDays]);

  const exerciseOptions = exercises.map((e) => ({ value: e, label: e }));

  // Drill-down helper function
  const fetchDrillDown = async (params: any, title: string) => {
    setDrillDownLoading(true);
    setDrillDownTitle(title);
    try {
      const data = await getDrillDownData(params);
      setDrillDownData(data);
      setDrillDownOpen(true);
    } catch (error) {
      console.error('Failed to fetch drill-down data:', error);
      setErrors(prev => ({ ...prev, drillDown: 'Failed to load drill-down data.' }));
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Handle tab change for overlapping points
  useEffect(() => {
    if (drillDownTabs.length > 0 && selectedTab < drillDownTabs.length && drillDownOpen) {
      const tab = drillDownTabs[selectedTab];
      setDrillDownLoading(true);
      getDrillDownData(tab.filter)
        .then(data => {
          setDrillDownData(data);
        })
        .catch(error => {
          console.error('Failed to fetch drill-down data:', error);
          setErrors(prev => ({ ...prev, drillDown: 'Failed to load drill-down data.' }));
        })
        .finally(() => {
          setDrillDownLoading(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab]);

  // Prepare muscle group data for chart
  const muscleGroupData = Object.entries(muscleVolume)
    .filter(([key]) => key !== 'other')
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      volume: Math.round(data.volume),
      sets: data.sets,
    }))
    .sort((a, b) => b.volume - a.volume);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-8 animate-fade-in">
      <Header
        title="Strength Lab"
        subtitle="Comprehensive strength training analytics and insights"
      />

      {/* Section 1: Key Metrics */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-100">Key Metrics</h2>
          
          {/* View 8: Total Volume Trends */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUpIcon className="w-5 h-5 text-accent" />
                    {volumeTrendsMuscleGroup === 'Total' ? 'Total' : volumeTrendsMuscleGroup} Volume Trends
                  </CardTitle>
                  <CardDescription>
                    {volumeTrendsMuscleGroup === 'Total' 
                      ? 'Weekly tonnage and sets over time' 
                      : `Weekly tonnage and sets for ${volumeTrendsMuscleGroup} over time`}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <TimeFrameSelector mode="weeks" value={volumeTrendsWeeks} onChange={setVolumeTrendsWeeks} />
                <Select
                  value={volumeTrendsMuscleGroup}
                  onChange={(e) => setVolumeTrendsMuscleGroup(e.target.value)}
                  options={[
                    { value: 'Total', label: 'Total' },
                    ...ALL_MUSCLE_GROUPS.map(mg => ({ value: mg, label: mg }))
                  ]}
                  placeholder="Select muscle group"
                />
              </div>
            </CardHeader>
            <CardContent>
              {errors.volumeTrends && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
                  {errors.volumeTrends}
                </div>
              )}
              {loadingStates.volumeTrends ? (
                <div className="h-80 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                </div>
              ) : (
                <>
                  <div className="h-80">
                    {volumeTrends.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart 
                          data={volumeTrends} 
                          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                          onClick={(data: any, index: number, e: any) => {
                            if (data && data.activePayload && data.activePayload[0]) {
                              const payload = data.activePayload[0].payload;
                              const drillDownParams: any = {
                                week_start: payload.week_start,
                                week_end: payload.week_end,
                              };
                              if (volumeTrendsMuscleGroup !== 'Total') {
                                drillDownParams.muscle_group = volumeTrendsMuscleGroup;
                              }
                              fetchDrillDown(
                                drillDownParams,
                                `${volumeTrendsMuscleGroup === 'Total' ? 'Total' : volumeTrendsMuscleGroup} - Week of ${formatDate(payload.week_start)}`
                              );
                            }
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                          <XAxis
                            dataKey="week_start"
                            stroke="#6b7280"
                            fontSize={12}
                            tickFormatter={(value) => formatDate(value, { month: 'short', day: 'numeric' })}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis
                            yAxisId="left"
                            stroke="#6b7280"
                            fontSize={12}
                            label={{ value: 'Tonnage (lbs)', angle: -90, position: 'insideLeft' }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="#6b7280"
                            fontSize={12}
                            label={{ value: 'Sets', angle: 90, position: 'insideRight' }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#12121a',
                              border: '1px solid #1e1e2e',
                              borderRadius: '8px',
                            }}
                            labelFormatter={(label) => `Week of ${formatDate(label)}`}
                            formatter={(value: any, name: string) => {
                              if (name === 'Tonnage') {
                                // Value is already in lbs from backend
                                return [`${value.toLocaleString()} lbs`, 'Tonnage'];
                              }
                              return [`${value}`, name];
                            }}
                          />
                          <Bar 
                            yAxisId="left" 
                            dataKey="total_tonnage" 
                            fill="#FF6B35" 
                            name="Tonnage" 
                            radius={[4, 4, 0, 0]}
                            onClick={(data: any, index: number, e: any) => {
                              e?.stopPropagation();
                              if (data && volumeTrends[index]) {
                                const week = volumeTrends[index];
                                const drillDownParams: any = {
                                  week_start: week.week_start,
                                  week_end: week.week_end,
                                };
                                if (volumeTrendsMuscleGroup !== 'Total') {
                                  drillDownParams.muscle_group = volumeTrendsMuscleGroup;
                                }
                                fetchDrillDown(
                                  drillDownParams,
                                  `${volumeTrendsMuscleGroup === 'Total' ? 'Total' : volumeTrendsMuscleGroup} - Week of ${formatDate(week.week_start)}`
                                );
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <Line 
                            yAxisId="right" 
                            type="monotone" 
                            dataKey="total_sets" 
                            stroke="#0ea5e9" 
                            strokeWidth={2} 
                            name="Sets"
                            onClick={(data: any, index: number, e: any) => {
                              e?.stopPropagation();
                              if (data && volumeTrends[index]) {
                                const week = volumeTrends[index];
                                const drillDownParams: any = {
                                  week_start: week.week_start,
                                  week_end: week.week_end,
                                };
                                if (volumeTrendsMuscleGroup !== 'Total') {
                                  drillDownParams.muscle_group = volumeTrendsMuscleGroup;
                                }
                                fetchDrillDown(
                                  drillDownParams,
                                  `${volumeTrendsMuscleGroup === 'Total' ? 'Total' : volumeTrendsMuscleGroup} - Week of ${formatDate(week.week_start)}`
                                );
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <Legend />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">No data</div>
                    )}
                  </div>
                  
                  {/* Metrics Panel */}
                  {volumeTrends.length > 0 && (() => {
                    const currentWeek = volumeTrends[volumeTrends.length - 1];
                    const fourWeekAvg = volumeTrends.slice(-4).reduce((acc, week) => ({
                      tonnage: acc.tonnage + week.total_tonnage,
                      sets: acc.sets + week.total_sets,
                    }), { tonnage: 0, sets: 0 });
                    const avgTonnage = fourWeekAvg.tonnage / 4;
                    const avgSets = fourWeekAvg.sets / 4;
                    const allTonnage = volumeTrends.map(w => w.total_tonnage);
                    const allSets = volumeTrends.map(w => w.total_sets);
                    const maxTonnage = Math.max(...allTonnage);
                    const minTonnage = Math.min(...allTonnage);
                    const maxTonnageWeek = volumeTrends.find(w => w.total_tonnage === maxTonnage);
                    const minTonnageWeek = volumeTrends.find(w => w.total_tonnage === minTonnage);
                    const trend = currentWeek.total_tonnage > avgTonnage ? '↑' : currentWeek.total_tonnage < avgTonnage ? '↓' : '→';
                    const trendPercent = avgTonnage > 0 ? ((currentWeek.total_tonnage - avgTonnage) / avgTonnage * 100) : 0;
                    
                    return (
                      <div className="mt-6 p-4 bg-card-border/50 rounded-lg space-y-2 text-sm">
                        <p>
                          Current week: {volumeTrendsMuscleGroup === 'Total' ? 'Total' : volumeTrendsMuscleGroup} volume: {formatVolumeDual(currentWeek.total_tonnage)} | {currentWeek.total_sets} sets
                        </p>
                        <p>
                          4-week average: {formatVolumeDual(avgTonnage)} | {avgSets.toFixed(0)} sets
                        </p>
                        <p>
                          {volumeTrendsWeeks}-week high: {formatVolumeDual(maxTonnage)} {maxTonnageWeek && `(${formatDate(maxTonnageWeek.week_start, { month: 'short', day: 'numeric' })})`}
                        </p>
                        <p>
                          {volumeTrendsWeeks}-week low: {formatVolumeDual(minTonnage)} {minTonnageWeek && `(${formatDate(minTonnageWeek.week_start, { month: 'short', day: 'numeric' })})`}
                        </p>
                        <p>
                          Trend: {trend} Volume {trend === '↑' ? 'increasing' : trend === '↓' ? 'decreasing' : 'stable'} {Math.abs(trendPercent).toFixed(1)}%
                        </p>
                        {currentWeek.week_over_week_delta_percent !== null && (
                          <p className="text-green-500">
                            {currentWeek.week_over_week_delta_percent > 0 ? '+' : ''}{currentWeek.week_over_week_delta_percent.toFixed(1)}% from last week
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
          
          {/* View 6: Training Balance */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-accent" />
                    Training Balance
                  </CardTitle>
                  <CardDescription>Strength vs Cardio sessions and time</CardDescription>
                </div>
              </div>
              <TimeFrameSelector mode="weeks" value={trainingBalanceWeeks} onChange={setTrainingBalanceWeeks} />
            </CardHeader>
            <CardContent>
              {errors.trainingBalance && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
                  {errors.trainingBalance}
                </div>
              )}
              {loadingStates.trainingBalance ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                </div>
              ) : (
                <>
                  {/* Transform data for small multiples */}
                  {trainingBalance.length > 0 && (() => {
                    // Calculate avg minutes per session for chart data
                    const chartData = trainingBalance.map(week => ({
                      ...week,
                      strength_avg_min_per_session: week.strength_sessions > 0 
                        ? week.strength_minutes / week.strength_sessions 
                        : 0,
                      cardio_avg_min_per_session: week.cardio_sessions > 0 
                        ? (week.zone2_minutes + week.vo2_minutes) / week.cardio_sessions 
                        : 0,
                      cardio_total_minutes: week.zone2_minutes + week.vo2_minutes,
                    }));

                    return (
                      <div>
                        {/* Tab Selector */}
                        <div className="flex gap-2 mb-4 border-b border-card-border">
                          <button
                            onClick={() => setTrainingBalanceTab('sessions')}
                            className={cn(
                              "px-4 py-2 rounded-t text-sm font-medium transition-colors",
                              trainingBalanceTab === 'sessions'
                                ? 'bg-accent text-white border-b-2 border-accent'
                                : 'bg-transparent text-gray-400 hover:text-gray-200'
                            )}
                          >
                            Sessions & Intensity
                          </button>
                          <button
                            onClick={() => setTrainingBalanceTab('minutes')}
                            className={cn(
                              "px-4 py-2 rounded-t text-sm font-medium transition-colors",
                              trainingBalanceTab === 'minutes'
                                ? 'bg-accent text-white border-b-2 border-accent'
                                : 'bg-transparent text-gray-400 hover:text-gray-200'
                            )}
                          >
                            Total Minutes per Week
                          </button>
                        </div>

                        {/* Small Multiples: Sessions & Intensity */}
                        {trainingBalanceTab === 'sessions' && (
                          <div className="space-y-8">
                            {/* Chart 1: Session Counts */}
                            <div>
                              <h4 className="text-sm font-medium mb-4">Session Count</h4>
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart 
                                    data={chartData} 
                                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                                    <XAxis
                                      dataKey="week_start"
                                      stroke="#6b7280"
                                      fontSize={12}
                                      tickFormatter={(value) => formatDate(value, { month: 'short', day: 'numeric' })}
                                      interval={0}
                                      angle={-45}
                                      textAnchor="end"
                                      height={60}
                                    />
                                    <YAxis 
                                      stroke="#6b7280" 
                                      fontSize={12}
                                      label={{ value: 'Sessions', angle: -90, position: 'insideLeft' }}
                                    />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#12121a',
                                        border: '1px solid #1e1e2e',
                                        borderRadius: '8px',
                                      }}
                                      labelFormatter={(label) => `Week of ${formatDate(label)}`}
                                      formatter={(value: any, name: string) => [`${value} sessions`, name]}
                                    />
                                    <Bar 
                                      dataKey="strength_sessions" 
                                      fill="#FF6B35" 
                                      name="Strength" 
                                      radius={[4, 4, 0, 0]}
                                      onClick={(data: any, index: number, e: any) => {
                                        e?.stopPropagation();
                                        if (data && chartData[index]) {
                                          const week = chartData[index];
                                          fetchDrillDown(
                                            {
                                              week_start: week.week_start,
                                              week_end: week.week_end,
                                              activity_type: 'strength_training',
                                            },
                                            `Strength - Week of ${formatDate(week.week_start)}`
                                          );
                                        }
                                      }}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <Bar 
                                      dataKey="cardio_sessions" 
                                      fill="#2ECC71" 
                                      name="Cardio" 
                                      radius={[4, 4, 0, 0]}
                                      onClick={(data: any, index: number, e: any) => {
                                        e?.stopPropagation();
                                        if (data && chartData[index]) {
                                          const week = chartData[index];
                                          fetchDrillDown(
                                            {
                                              week_start: week.week_start,
                                              week_end: week.week_end,
                                              activity_type: 'cardio',
                                            },
                                            `Cardio - Week of ${formatDate(week.week_start)}`
                                          );
                                        }
                                      }}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <Legend />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            {/* Chart 2: Avg Minutes per Session */}
                            <div>
                              <h4 className="text-sm font-medium mb-4">Average Minutes per Session</h4>
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart 
                                    data={chartData} 
                                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                                    <XAxis
                                      dataKey="week_start"
                                      stroke="#6b7280"
                                      fontSize={12}
                                      tickFormatter={(value) => formatDate(value, { month: 'short', day: 'numeric' })}
                                      interval={0}
                                      angle={-45}
                                      textAnchor="end"
                                      height={60}
                                    />
                                    <YAxis 
                                      stroke="#6b7280" 
                                      fontSize={12}
                                      label={{ value: 'Minutes per Session', angle: -90, position: 'insideLeft' }}
                                    />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#12121a',
                                        border: '1px solid #1e1e2e',
                                        borderRadius: '8px',
                                      }}
                                      labelFormatter={(label) => `Week of ${formatDate(label)}`}
                                      formatter={(value: any, name: string) => {
                                        if (value === null || value === undefined || isNaN(value)) {
                                          return ['No sessions', name];
                                        }
                                        return [`${value.toFixed(1)} min/session`, name];
                                      }}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey="strength_avg_min_per_session" 
                                      stroke="#FF6B35" 
                                      strokeWidth={2}
                                      name="Strength"
                                      dot={{ fill: '#FF6B35', r: 4 }}
                                      activeDot={{ r: 6 }}
                                      connectNulls={false}
                                      onClick={(data: any, index: number, e: any) => {
                                        e?.stopPropagation();
                                        if (data && chartData[index]) {
                                          const week = chartData[index];
                                          fetchDrillDown(
                                            {
                                              week_start: week.week_start,
                                              week_end: week.week_end,
                                              activity_type: 'strength_training',
                                            },
                                            `Strength - Week of ${formatDate(week.week_start)}`
                                          );
                                        }
                                      }}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey="cardio_avg_min_per_session" 
                                      stroke="#2ECC71" 
                                      strokeWidth={2}
                                      name="Cardio"
                                      dot={{ fill: '#2ECC71', r: 4 }}
                                      activeDot={{ r: 6 }}
                                      connectNulls={false}
                                      onClick={(data: any, index: number, e: any) => {
                                        e?.stopPropagation();
                                        if (data && chartData[index]) {
                                          const week = chartData[index];
                                          fetchDrillDown(
                                            {
                                              week_start: week.week_start,
                                              week_end: week.week_end,
                                              activity_type: 'cardio',
                                            },
                                            `Cardio - Week of ${formatDate(week.week_start)}`
                                          );
                                        }
                                      }}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <Legend />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Chart 2: Total Minutes per Week */}
                        {trainingBalanceTab === 'minutes' && (
                          <div>
                            <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart 
                                data={chartData} 
                                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                                onClick={(data: any, index: number, e: any) => {
                                  if (data && data.activePayload && data.activePayload[0]) {
                                    const payload = data.activePayload[0].payload;
                                    fetchDrillDown(
                                      {
                                        week_start: payload.week_start,
                                        week_end: payload.week_end,
                                      },
                                      `Week of ${formatDate(payload.week_start)}`
                                    );
                                  }
                                }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                                <XAxis
                                  dataKey="week_start"
                                  stroke="#6b7280"
                                  fontSize={12}
                                  tickFormatter={(value) => formatDate(value, { month: 'short', day: 'numeric' })}
                                  interval={0}
                                  angle={-45}
                                  textAnchor="end"
                                  height={60}
                                />
                                <YAxis 
                                  stroke="#6b7280" 
                                  fontSize={12}
                                  label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#12121a',
                                    border: '1px solid #1e1e2e',
                                    borderRadius: '8px',
                                  }}
                                  labelFormatter={(label) => `Week of ${formatDate(label)}`}
                                  formatter={(value: any, name: string) => [`${value} min`, name]}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="strength_minutes" 
                                  stroke="#FF6B35" 
                                  strokeWidth={2}
                                  name="Strength Minutes"
                                  dot={{ fill: '#FF6B35', r: 4 }}
                                  onClick={(data: any, index: number, e: any) => {
                                    e?.stopPropagation();
                                    if (data && chartData[index]) {
                                      const week = chartData[index];
                                      fetchDrillDown(
                                        {
                                          week_start: week.week_start,
                                          week_end: week.week_end,
                                          activity_type: 'strength_training',
                                        },
                                        `Strength - Week of ${formatDate(week.week_start)}`
                                      );
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="cardio_total_minutes" 
                                  stroke="#2ECC71" 
                                  strokeWidth={2}
                                  name="Cardio Minutes"
                                  dot={{ fill: '#2ECC71', r: 4 }}
                                  onClick={(data: any, index: number, e: any) => {
                                    e?.stopPropagation();
                                    if (data && chartData[index]) {
                                      const week = chartData[index];
                                      fetchDrillDown(
                                        {
                                          week_start: week.week_start,
                                          week_end: week.week_end,
                                          activity_type: 'cardio',
                                        },
                                        `Cardio - Week of ${formatDate(week.week_start)}`
                                      );
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                                <Legend />
                              </LineChart>
                            </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {trainingBalance.length === 0 && (
                    <div className="flex items-center justify-center h-64 text-gray-500">No data</div>
                  )}
          
          {/* Context Panel */}
          {trainingBalance.length > 0 && (() => {
            const currentWeek = trainingBalance[trainingBalance.length - 1];
            const fourWeekAvg = trainingBalance.slice(-4).reduce((acc, week) => ({
              strength: acc.strength + week.strength_sessions,
              cardio: acc.cardio + week.cardio_sessions,
              strengthMin: acc.strengthMin + week.strength_minutes,
              zone2Min: acc.zone2Min + week.zone2_minutes,
            }), { strength: 0, cardio: 0, strengthMin: 0, zone2Min: 0 });
            const avgStrength = fourWeekAvg.strength / 4;
            const avgCardio = fourWeekAvg.cardio / 4;
            const avgStrengthMin = fourWeekAvg.strengthMin / 4;
            const avgZone2Min = fourWeekAvg.zone2Min / 4;
            
            return (
              <div className="mt-6 p-4 bg-card-border/50 rounded-lg space-y-2 text-sm">
                <p>
                  This week: {currentWeek.strength_sessions} strength, {currentWeek.zone2_sessions} Zone 2, {currentWeek.vo2_sessions} VO2 Max
                </p>
                <p>
                  Duration: {currentWeek.strength_minutes} min strength | {currentWeek.zone2_minutes} min Zone 2 | {currentWeek.vo2_minutes} min VO2 Max
                </p>
                <p>
                  vs 4-week avg: {currentWeek.strength_sessions < avgStrength ? '↓' : currentWeek.strength_sessions > avgStrength ? '↑' : '→'} {Math.abs(currentWeek.strength_sessions - avgStrength).toFixed(0)} strength sessions, 
                  {currentWeek.zone2_minutes < avgZone2Min ? ' ↓' : currentWeek.zone2_minutes > avgZone2Min ? ' ↑' : ' →'} {Math.abs(currentWeek.zone2_minutes - avgZone2Min).toFixed(0)} min Zone 2
                </p>
                <p>
                  Strength/Cardio ratio: {(currentWeek.strength_sessions / (currentWeek.cardio_sessions || 1)).toFixed(2)}:1
                </p>
              </div>
            );
          })()}
                </>
              )}
            </CardContent>
          </Card>

      {/* View 9: Muscle Comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <CardTitle>Muscle Group Comparison</CardTitle>
              <CardDescription>Compare sets per week across muscle groups (all groups selected by default)</CardDescription>
            </div>
          </div>
          <TimeFrameSelector mode="weeks" value={muscleComparisonWeeks} onChange={setMuscleComparisonWeeks} />
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-3">
            {/* View Mode Selector */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setComparisonViewMode('individual')}
                className={cn("px-3 py-1 rounded text-sm transition-colors", comparisonViewMode === 'individual' ? 'bg-accent text-white' : 'bg-card-border hover:bg-card-border/80')}
              >
                Individual
              </button>
              <button
                onClick={() => setComparisonViewMode('upperLower')}
                className={cn("px-3 py-1 rounded text-sm transition-colors", comparisonViewMode === 'upperLower' ? 'bg-accent text-white' : 'bg-card-border hover:bg-card-border/80')}
              >
                Upper/Lower
              </button>
              <button
                onClick={() => setComparisonViewMode('bodyRegions')}
                className={cn("px-3 py-1 rounded text-sm transition-colors", comparisonViewMode === 'bodyRegions' ? 'bg-accent text-white' : 'bg-card-border hover:bg-card-border/80')}
              >
                Body Regions
              </button>
            </div>

            {/* MultiSelect - only show in individual mode */}
            {comparisonViewMode === 'individual' && (
              <>
                <MultiSelect
                  label="Select Muscle Groups"
                  options={['Chest', 'Back', 'Quads', 'Hamstrings', 'Biceps', 'Triceps', 'Shoulders', 'Glutes', 'Abs', 'Calves']}
                  selected={selectedMuscles}
                  onChange={setSelectedMuscles}
                  min={2}
                />
                
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedMuscles(['Chest', 'Back'])}
                    className="px-3 py-1 rounded text-sm bg-card-border hover:bg-card-border/80 transition-colors"
                  >
                    Chest vs Back
                  </button>
                  <button
                    onClick={() => setSelectedMuscles(['Quads', 'Hamstrings'])}
                    className="px-3 py-1 rounded text-sm bg-card-border hover:bg-card-border/80 transition-colors"
                  >
                    Quads vs Hamstrings
                  </button>
                  <button
                    onClick={() => setSelectedMuscles(['Biceps', 'Triceps'])}
                    className="px-3 py-1 rounded text-sm bg-card-border hover:bg-card-border/80 transition-colors"
                  >
                    Biceps vs Triceps
                  </button>
                </div>
              </>
            )}
          </div>
          
          {errors.muscleComparison && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
              {errors.muscleComparison}
            </div>
          )}
          
          {loadingStates.muscleComparison && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          )}
          
          {!loadingStates.muscleComparison && selectedMuscles.length >= 2 && (() => {
            if (muscleComparison.length === 0) {
              return (
                <div className="h-80 flex items-center justify-center text-gray-500">
                  No data available
                </div>
              );
            }

            // Aggregate data based on view mode
            const aggregatedData = aggregateMuscleComparison(muscleComparison, comparisonViewMode);
            
            // Determine which groups to display
            let displayGroups: string[];
            if (comparisonViewMode === 'upperLower') {
              displayGroups = ['Upper Body', 'Lower Body'];
            } else if (comparisonViewMode === 'bodyRegions') {
              displayGroups = ['Arms', 'Chest', 'Back', 'Legs'];
            } else {
              displayGroups = selectedMuscles;
            }
            
            // Transform data for Recharts (flatten muscle_groups)
            const chartData = aggregatedData.map(week => ({
              week_start: week.week_start,
              ...week.muscle_groups
            }));
            
              return (
                <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={chartData} 
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    onClick={(data: any, e: any) => {
                      // When clicking on the chart, determine which specific line was clicked
                      if (data && data.activePayload && data.activePayload.length > 0) {
                        // Get the payload (week data)
                        const payload = data.activePayload[0].payload;
                        const week = aggregatedData.find(w => w.week_start === payload.week_start);
                        
                        if (week && e && e.chartY !== undefined) {
                          // Get mouse Y position relative to chart
                          const clickY = e.chartY;
                          
                          // Get all active values at this point
                          const activeValues = data.activePayload
                            .filter((p: any) => p.value !== undefined && p.value !== null && p.value > 0)
                            .map((p: any) => ({
                              name: p.dataKey,
                              value: p.value,
                              payload: p.payload
                            }));
                          
                          if (activeValues.length > 1) {
                            // Multiple points - find which one is closest to click Y
                            // Calculate Y positions for each value (approximate based on chart scale)
                            const chartHeight = 320; // h-80 = 320px
                            const marginTop = 5;
                            const marginBottom = 5;
                            const plotHeight = chartHeight - marginTop - marginBottom;
                            
                            // Get min and max values across all active points to calculate scale
                            const allValues = activeValues.map(av => av.value);
                            const minValue = Math.min(...allValues);
                            const maxValue = Math.max(...allValues);
                            const valueRange = maxValue - minValue || 1;
                            
                            // Find which value's Y position is closest to clickY
                            let closestLine = activeValues[0];
                            let minDistance = Infinity;
                            
                            activeValues.forEach(av => {
                              // Calculate Y position for this value (inverted because chart Y increases downward)
                              const normalizedValue = (av.value - minValue) / valueRange;
                              const valueY = marginTop + plotHeight - (normalizedValue * plotHeight);
                              const distance = Math.abs(clickY - valueY);
                              
                              if (distance < minDistance) {
                                minDistance = distance;
                                closestLine = av;
                              }
                            });
                            
                            // Check if other lines have the same value as the closest one
                            const sameValueLines = activeValues.filter(av => av.value === closestLine.value);
                            if (sameValueLines.length > 1) {
                              // Multiple lines with same value - show tabs
                              const tabs = sameValueLines.map(av => ({
                                label: av.name,
                                filter: {
                                  week_start: week.week_start,
                                  week_end: week.week_end,
                                  muscle_group: av.name,
                                }
                              }));
                              setDrillDownTabs(tabs);
                              setSelectedTab(0);
                              setDrillDownTitle(`Week of ${formatDate(week.week_start)}`);
                              setDrillDownOpen(true);
                            } else {
                              // Single closest line clicked
                              fetchDrillDown(
                                {
                                  week_start: week.week_start,
                                  week_end: week.week_end,
                                  muscle_group: closestLine.name,
                                },
                                `${closestLine.name} - Week of ${formatDate(week.week_start)}`
                              );
                            }
                          } else if (activeValues.length === 1) {
                            // Single point clicked
                            fetchDrillDown(
                              {
                                week_start: week.week_start,
                                week_end: week.week_end,
                                muscle_group: activeValues[0].name,
                              },
                              `${activeValues[0].name} - Week of ${formatDate(week.week_start)}`
                            );
                          }
                        }
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="week_start"
                      stroke="#6b7280"
                      fontSize={12}
                      tickFormatter={(value) => formatDate(value, { month: 'short', day: 'numeric' })}
                    />
                    <YAxis 
                      stroke="#6b7280" 
                      fontSize={12}
                      label={{ value: 'Sets per Week', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(label) => `Week of ${formatDate(label)}`}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          // Sort payload by value in descending order
                          const sortedPayload = [...payload].sort((a, b) => {
                            const aValue = a.value || 0;
                            const bValue = b.value || 0;
                            return bValue - aValue;
                          });
                          
                          return (
                            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-lg p-3">
                              <p className="font-semibold text-white mb-2">
                                Week of {formatDate(label)}
                              </p>
                              <div className="space-y-1">
                                {sortedPayload.map((entry: any, index: number) => {
                                  if (entry.value === null || entry.value === undefined || entry.value === 0) {
                                    return null;
                                  }
                                  return (
                                    <p key={index} className="text-sm">
                                      <span style={{ color: entry.color }}>●</span>{' '}
                                      <span className="text-gray-300">{entry.name}:</span>{' '}
                                      <span className="text-white font-medium">{entry.value} sets</span>
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    {displayGroups.map((mg, idx) => {
                      const colors = ['#0ea5e9', '#10b981', '#FF6B35', '#9B59B6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
                      const color = colors[idx % colors.length];
                      
                      // Custom activeDot with click handler
                      const CustomActiveDot = (props: any) => {
                        const { cx, cy, payload, value } = props;
                        
                        const handleClick = (event: any) => {
                          event.stopPropagation();
                          if (payload) {
                            const week = aggregatedData.find(w => w.week_start === payload.week_start);
                            if (week) {
                              const valuesAtPoint = displayGroups
                                .map(group => ({
                                  name: group,
                                  value: payload[group] || 0
                                }))
                                .filter(v => v.value > 0);
                              
                              const clickedValue = payload[mg] || 0;
                              const overlappingGroups = valuesAtPoint.filter(v => v.value === clickedValue);
                              
                              if (overlappingGroups.length > 1) {
                                const tabs = overlappingGroups.map(og => ({
                                  label: og.name,
                                  filter: {
                                    week_start: week.week_start,
                                    week_end: week.week_end,
                                    muscle_group: og.name,
                                  }
                                }));
                                setDrillDownTabs(tabs);
                                setSelectedTab(0);
                                setDrillDownTitle(`Week of ${formatDate(week.week_start)}`);
                                setDrillDownOpen(true);
                              } else {
                                fetchDrillDown(
                                  {
                                    week_start: week.week_start,
                                    week_end: week.week_end,
                                    muscle_group: mg,
                                  },
                                  `${mg} - Week of ${formatDate(week.week_start)}`
                                );
                              }
                            }
                          }
                        };
                        
                        return (
                          <g onClick={handleClick} style={{ cursor: 'pointer' }}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={6}
                              fill={color}
                              stroke="#fff"
                              strokeWidth={2}
                              style={{ cursor: 'pointer' }}
                            />
                          </g>
                        );
                      };
                      
                      // Regular dot component
                      const CustomDot = (props: any) => {
                        const { cx, cy, payload, value } = props;
                        if (value === null || value === undefined || value === 0) return null;
                        
                        const handleClick = (event: any) => {
                          event.stopPropagation();
                          if (payload) {
                            const week = aggregatedData.find(w => w.week_start === payload.week_start);
                            if (week) {
                              const valuesAtPoint = displayGroups
                                .map(group => ({
                                  name: group,
                                  value: payload[group] || 0
                                }))
                                .filter(v => v.value > 0);
                              
                              const clickedValue = payload[mg] || 0;
                              const overlappingGroups = valuesAtPoint.filter(v => v.value === clickedValue);
                              
                              if (overlappingGroups.length > 1) {
                                const tabs = overlappingGroups.map(og => ({
                                  label: og.name,
                                  filter: {
                                    week_start: week.week_start,
                                    week_end: week.week_end,
                                    muscle_group: og.name,
                                  }
                                }));
                                setDrillDownTabs(tabs);
                                setSelectedTab(0);
                                setDrillDownTitle(`Week of ${formatDate(week.week_start)}`);
                                setDrillDownOpen(true);
                              } else {
                                fetchDrillDown(
                                  {
                                    week_start: week.week_start,
                                    week_end: week.week_end,
                                    muscle_group: mg,
                                  },
                                  `${mg} - Week of ${formatDate(week.week_start)}`
                                );
                              }
                            }
                          }
                        };
                        
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={color}
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: 'pointer' }}
                            onClick={handleClick}
                            onMouseDown={handleClick}
                          />
                        );
                      };
                      
                      return (
                        <Line
                          key={mg}
                          type="monotone"
                          dataKey={mg}
                          stroke={color}
                          strokeWidth={2}
                          name={mg}
                          dot={CustomDot}
                          activeDot={CustomActiveDot}
                          style={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
          
          {!loadingStates.muscleComparison && comparisonViewMode === 'individual' && selectedMuscles.length < 2 && (
            <div className="h-80 flex items-center justify-center text-gray-500">
              Please select at least 2 muscle groups to compare
            </div>
          )}
          
          {/* Comparison Stats */}
          {muscleComparison.length > 0 && selectedMuscles.length >= 2 && (() => {
            // Aggregate data based on view mode
            const aggregatedData = aggregateMuscleComparison(muscleComparison, comparisonViewMode);
            
            // Determine which groups to display
            let displayGroups: string[];
            if (comparisonViewMode === 'upperLower') {
              displayGroups = ['Upper Body', 'Lower Body'];
            } else if (comparisonViewMode === 'bodyRegions') {
              displayGroups = ['Arms', 'Chest', 'Back', 'Legs'];
            } else {
              displayGroups = selectedMuscles;
            }
            
            const averages: Record<string, number> = {};
            displayGroups.forEach(mg => {
              const values = aggregatedData.map(w => w.muscle_groups[mg] || 0);
              averages[mg] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            });
            
            // Show stats for all display groups
            const groupsList = displayGroups.map(mg => `${mg}: ${averages[mg].toFixed(1)} sets/week`).join(' | ');
            const allAverages = displayGroups.map(mg => averages[mg]);
            const maxAvg = Math.max(...allAverages);
            const minAvg = Math.min(...allAverages);
            const maxGroup = displayGroups.find(mg => averages[mg] === maxAvg);
            const minGroup = displayGroups.find(mg => averages[mg] === minAvg);
            const ratio = minAvg > 0 ? maxAvg / minAvg : 0;
            const gaps = aggregatedData.map(w => {
              const values = displayGroups.map(mg => w.muscle_groups[mg] || 0);
              return Math.max(...values) - Math.min(...values);
            });
            const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
            const maxGapIdx = gaps.indexOf(maxGap);
            const maxGapWeek = maxGapIdx >= 0 ? aggregatedData[maxGapIdx] : null;
            const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;
            const minGapIdx = gaps.indexOf(minGap);
            const minGapWeek = minGapIdx >= 0 ? aggregatedData[minGapIdx] : null;
            
            return (
              <div className="mt-6 p-4 bg-card-border/50 rounded-lg space-y-2 text-sm">
                <p>
                  {groupsList}
                </p>
                {displayGroups.length === 2 ? (
                  <p>
                    Ratio: {ratio.toFixed(2)} ({maxGroup} {ratio > 1.2 ? 'significantly' : ratio > 1 ? 'slightly' : 'even'}-trained vs {minGroup})
                  </p>
                ) : (
                  <p>
                    Range: {minGroup} ({minAvg.toFixed(1)} sets/week) to {maxGroup} ({maxAvg.toFixed(1)} sets/week) - {ratio.toFixed(2)}x difference
                  </p>
                )}
                {maxGapWeek && (
                  <p>
                    Biggest gap: {maxGap} sets ({formatDate(maxGapWeek.week_start, { month: 'short', day: 'numeric' })})
                  </p>
                )}
                {minGapWeek && (
                  <p>
                    Most balanced: {minGap} sets ({formatDate(minGapWeek.week_start, { month: 'short', day: 'numeric' })})
                  </p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
        </div>
      </div>

      {/* Section 2: Overview */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-100">Overview</h2>
          
          {/* View 3: Key Lift Progress Cards */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-accent" />
                Key Lift Progress Cards
              </CardTitle>
              <CardDescription>Top 10 most frequent exercises in the last 2 months</CardDescription>
            </CardHeader>
            <CardContent>
              {errors.keyLifts && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
                  {errors.keyLifts}
                </div>
              )}
              {loadingStates.keyLifts ? (
                <div className="h-32 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {keyLifts.map((lift) => (
                    <div
                      key={lift.exercise_name}
                      className={cn(
                        "p-4 rounded-lg border transition-all cursor-pointer hover:scale-105",
                        lift.status === 'progress' && "border-green-500/50 bg-green-500/10",
                        lift.status === 'stable' && "border-gray-500/50 bg-gray-500/10",
                        lift.status === 'plateau' && "border-yellow-500/50 bg-yellow-500/10",
                        lift.status === 'declining' && "border-red-500/50 bg-red-500/10"
                      )}
                    >
                      <h3 className="font-semibold text-lg mb-2">{lift.exercise_name}</h3>
                      {lift.best_recent_weight && lift.best_recent_reps && (
                        <p className="text-sm text-gray-400 mb-1">
                          Best Recent: {formatWeightDual(lift.best_recent_weight)} × {lift.best_recent_reps} reps
                        </p>
                      )}
                      {lift.estimated_1rm && (
                        <p className="text-sm font-mono text-accent mb-1">
                          Est. 1RM: {formatWeightDual(lift.estimated_1rm)}
                        </p>
                      )}
                      {lift.four_week_trend_percent !== null && (
                        <p className="text-xs text-gray-500 mb-1">
                          4-Week Trend: {lift.four_week_trend_percent > 0 ? '+' : ''}{lift.four_week_trend_percent.toFixed(1)}%
                          {lift.four_week_trend_lbs && ` (${lift.four_week_trend_lbs > 0 ? '+' : ''}${formatWeightDual(lift.four_week_trend_lbs)})`}
                        </p>
                      )}
                      {lift.volume_trend_percent !== null && (
                        <p className="text-xs text-gray-500 mb-1">
                          Volume: {lift.volume_trend_percent > 0 ? '↑' : lift.volume_trend_percent < 0 ? '↓' : '→'} {Math.abs(lift.volume_trend_percent).toFixed(1)}% vs avg
                        </p>
                      )}
                      {lift.last_trained_date && (
                        <p className="text-xs text-gray-500">
                          Last trained: {formatDate(lift.last_trained_date)} ({lift.days_since_last} days ago)
                        </p>
                      )}
                    </div>
                  ))}
                  {keyLifts.length === 0 && !errors.keyLifts && (
                    <p className="text-gray-500 text-center py-4 w-full">No key lifts data available</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Personal Records & Muscle Groups */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Personal Records */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Personal Records
            </CardTitle>
            <CardDescription>Your top estimated 1RM by exercise</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {prs.slice(0, 8).map((pr, index) => (
                <div
                  key={pr.exercise_name}
                  className="flex items-center justify-between py-2 border-b border-card-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                      index === 1 ? 'bg-gray-400/20 text-gray-400' :
                      index === 2 ? 'bg-amber-600/20 text-amber-600' :
                      'bg-card-border text-gray-500'
                    )}>
                      {index + 1}
                    </span>
                    <span className="text-gray-100 truncate max-w-[200px]">{pr.exercise_name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-accent">{formatWeightDual(pr.estimated_1rm)}</p>
                    <p className="text-xs text-gray-500">{formatDate(pr.date_achieved)}</p>
                  </div>
                </div>
              ))}
              {prs.length === 0 && (
                <p className="text-gray-500 text-center py-4">No PRs recorded yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Muscle Group Volume */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <CardTitle>Volume by Muscle Group</CardTitle>
                <CardDescription>Volume breakdown by muscle group</CardDescription>
              </div>
            </div>
            <TimeFrameSelector mode="days" value={muscleVolumeDays} onChange={setMuscleVolumeDays} />
          </CardHeader>
          <CardContent>
            <div className="h-[500px]">
              {muscleGroupData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={muscleGroupData}
                      cx="50%"
                      cy="45%"
                      labelLine={true}
                      label={({ name, percent, value }) => {
                        // Show label for all slices, but format differently for very small ones
                        if (percent > 0.01) {
                          // For slices > 1%, show name and percentage
                          return `${name}: ${(percent * 100).toFixed(0)}%`;
                        } else if (value > 0) {
                          // For very small slices, just show name
                          return name;
                        }
                        return '';
                      }}
                      outerRadius={140}
                      fill="#8884d8"
                      dataKey="volume"
                      onClick={(entry: any, index: number) => {
                        if (entry) {
                          const muscleGroup = entry.name;
                          const endDate = new Date();
                          const startDate = new Date();
                          startDate.setDate(endDate.getDate() - muscleVolumeDays);
                          fetchDrillDown(
                            {
                              date_range_start: startDate.toISOString().split('T')[0],
                              date_range_end: endDate.toISOString().split('T')[0],
                              muscle_group: muscleGroup,
                            },
                            `${muscleGroup} - Last ${muscleVolumeDays} days`
                          );
                        }
                      }}
                    >
                      {muscleGroupData.map((entry, index) => {
                        // More distinct, varied colors
                        const colors = [
                          '#FF6B35', // Orange - Chest
                          '#2ECC71', // Green - Back
                          '#3498DB', // Blue - Glutes
                          '#9B59B6', // Purple - Hamstrings
                          '#E74C3C', // Red - Biceps
                          '#F39C12', // Orange/Yellow - Triceps
                          '#1ABC9C', // Teal - Abs
                          '#E67E22', // Dark Orange - Shoulders
                          '#95A5A6', // Gray - Calves
                          '#34495E', // Dark Blue - Quads
                        ];
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={colors[index % colors.length]}
                            style={{ cursor: 'pointer' }}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      itemStyle={{ color: '#e5e7eb' }}
                      labelStyle={{ color: '#ffffff', fontWeight: '600', marginBottom: '4px' }}
                      formatter={(value: number, name: string, props: any) => {
                        // Value is already in lbs from backend
                        const percent = props.payload && muscleGroupData.length > 0
                          ? ((value / muscleGroupData.reduce((sum: number, d: any) => sum + d.volume, 0)) * 100).toFixed(1)
                          : '0.0';
                        return [`${value.toLocaleString()} lbs (${percent}%)`, 'Volume'];
                      }}
                      labelFormatter={(label) => {
                        // Show muscle group name as the label
                        return label || 'Muscle Group';
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      layout="horizontal"
                      wrapperStyle={{ color: '#9ca3af', fontSize: '12px', paddingTop: '20px' }}
                      formatter={(value, entry: any) => {
                        const data = muscleGroupData.find(d => d.name === value);
                        if (data) {
                          const percent = ((data.volume / muscleGroupData.reduce((sum, d) => sum + d.volume, 0)) * 100).toFixed(1);
                          return `${value} (${percent}%)`;
                        }
                        return value;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No volume data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
        </div>
      </div>

      {/* Section 3: Analysis */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-100">Analysis</h2>
          
              <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <CardTitle>Training Frequency Analysis</CardTitle>
                  <CardDescription>Average sessions per week by muscle group</CardDescription>
                </div>
              </div>
              <TimeFrameSelector mode="weeks" value={trainingFrequencyWeeks} onChange={setTrainingFrequencyWeeks} />
            </CardHeader>
            <CardContent>
              {errors.trainingFrequency && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
                  {errors.trainingFrequency}
                </div>
              )}
              {loadingStates.trainingFrequency ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                </div>
              ) : (
                <>
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setFrequencySortBy('frequency')}
              className={cn("px-3 py-1 rounded text-sm", frequencySortBy === 'frequency' ? 'bg-accent text-white' : 'bg-card-border')}
            >
              Frequency
            </button>
            <button
              onClick={() => setFrequencySortBy('days_since')}
              className={cn("px-3 py-1 rounded text-sm", frequencySortBy === 'days_since' ? 'bg-accent text-white' : 'bg-card-border')}
            >
              Days Since
            </button>
            <button
              onClick={() => setFrequencySortBy('volume')}
              className={cn("px-3 py-1 rounded text-sm", frequencySortBy === 'volume' ? 'bg-accent text-white' : 'bg-card-border')}
            >
              Total Volume
            </button>
            <button
              onClick={() => setFrequencySortBy('alphabetical')}
              className={cn("px-3 py-1 rounded text-sm", frequencySortBy === 'alphabetical' ? 'bg-accent text-white' : 'bg-card-border')}
            >
              Alphabetical
            </button>
          </div>
          <div className="h-96">
            {trainingFrequency.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trainingFrequency}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis 
                    type="number" 
                    stroke="#6b7280" 
                    fontSize={12}
                    label={{ value: 'Sessions per Week', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis dataKey="muscle_group" type="category" stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)} sessions/week`, 'Average Frequency']}
                  />
                  <Bar 
                    dataKey="avg_sessions_per_week" 
                    fill="#0ea5e9" 
                    radius={[0, 4, 4, 0]}
                    onClick={(data: any, index: number, e: any) => {
                      e?.stopPropagation();
                      if (data && trainingFrequency[index]) {
                        const muscleGroup = trainingFrequency[index].muscle_group;
                        const endDate = new Date();
                        const startDate = new Date();
                        startDate.setDate(endDate.getDate() - (trainingFrequencyWeeks * 7));
                        fetchDrillDown(
                          {
                            date_range_start: startDate.toISOString().split('T')[0],
                            date_range_end: endDate.toISOString().split('T')[0],
                            muscle_group: muscleGroup,
                          },
                          `${muscleGroup} - Last ${trainingFrequencyWeeks} weeks`
                        );
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No data</div>
            )}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {trainingFrequency.map((mg) => (
              <div key={mg.muscle_group} className="flex justify-between items-center py-1 border-b border-card-border">
                <span className="font-medium">{mg.muscle_group}</span>
                <div className="flex gap-4 text-gray-400">
                  <span>{mg.avg_sessions_per_week.toFixed(2)}x/week</span>
                  <span>{mg.days_since_last !== null ? `${mg.days_since_last} days ago` : 'Never'}</span>
                  <span>{mg.total_sets} sets</span>
                </div>
              </div>
            ))}
          </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Drill-Down Drawer */}
      <Drawer
        open={drillDownOpen}
        onClose={() => {
          setDrillDownOpen(false);
          setDrillDownTabs([]);
          setSelectedTab(0);
        }}
        title={drillDownTabs.length > 1 ? drillDownTitle : drillDownTitle}
        description={
          drillDownTabs.length > 1
            ? `Multiple data points overlap. Select a tab to view details.`
            : undefined
        }
      >
        {drillDownTabs.length > 1 && (
          <div className="mb-4 flex gap-2 border-b border-card-border pb-4">
            {drillDownTabs.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedTab(idx)}
                className={cn(
                  'px-4 py-2 rounded text-sm transition-colors',
                  selectedTab === idx
                    ? 'bg-accent text-white'
                    : 'bg-card-border hover:bg-card-border/80 text-gray-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <DrillDownContent data={drillDownData} loading={drillDownLoading} />
      </Drawer>
    </div>
  );
}

