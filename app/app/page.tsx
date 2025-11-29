'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatWeekLabel, formatMonthLabel, getMetricDisplayName, getMetricDescription, formatNumberWithSeparators } from './lib/training-utils';
import CustomTooltip from './components/CustomTooltip';

interface ExploreDataPoint {
  week_start_date?: string;
  month_start_date?: string;
  workout_type?: string;
  muscle_group?: string;
  exercise_name?: string;
  value: number;
  total_duration_min?: number;
  total_sessions?: number;
  total_tonnage?: number;
  total_sets?: number;
  total_reps?: number;
}

interface ExploreResponse {
  data: ExploreDataPoint[];
  meta: {
    view: string;
    metric: string;
    period: string;
    count: number;
  };
  error?: string;
  hint?: string;
}

export default function Home() {
  // Strength vs Cardio state
  const [strengthCardioPeriod, setStrengthCardioPeriod] = useState<'week' | 'month'>('week');
  const [strengthCardioMetric, setStrengthCardioMetric] = useState<'duration' | 'sessions'>('duration');
  const [strengthCardioData, setStrengthCardioData] = useState<ExploreDataPoint[]>([]);
  const [strengthCardioLoading, setStrengthCardioLoading] = useState(false);

  // Muscle Group state
  const [muscleGroupPeriod, setMuscleGroupPeriod] = useState<'week' | 'month'>('week');
  const [muscleGroupView, setMuscleGroupView] = useState<'upper_lower' | 'individual'>('upper_lower');
  const [muscleGroupMetric, setMuscleGroupMetric] = useState<'total_tonnage' | 'total_sets' | 'total_reps'>('total_tonnage');
  const [muscleGroupData, setMuscleGroupData] = useState<ExploreDataPoint[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<{ upper: string[]; lower: string[]; other: string[] }>({ upper: [], lower: [], other: [] });
  const [muscleGroupLoading, setMuscleGroupLoading] = useState(false);

  // Exercise Progression state
  const [exercisePeriod, setExercisePeriod] = useState<'week' | 'month'>('week');
  const [exerciseMetric, setExerciseMetric] = useState<'total_tonnage' | 'total_sets' | 'total_reps'>('total_tonnage');
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [exercises, setExercises] = useState<string[]>([]);
  const [exerciseData, setExerciseData] = useState<ExploreDataPoint[]>([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildingTables, setBuildingTables] = useState(false);
  const [tablesNeedBuild, setTablesNeedBuild] = useState(false);

  // Fetch exercises list
  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const res = await fetch('/api/exercises');
        const data = await res.json();
        if (res.ok && data.exercises) {
          setExercises(data.exercises);
          if (data.exercises.length > 0 && !selectedExercise) {
            setSelectedExercise(data.exercises[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch exercises:', err);
      }
    };
    fetchExercises();
  }, []);

  // Fetch muscle groups
  useEffect(() => {
    const fetchMuscleGroups = async () => {
      try {
        const res = await fetch('/api/muscle-groups');
        const data = await res.json();
        if (res.ok && data.grouped) {
          setMuscleGroups(data.grouped);
        }
      } catch (err) {
        console.error('Failed to fetch muscle groups:', err);
      }
    };
    fetchMuscleGroups();
  }, []);

  // Fetch strength vs cardio data
  useEffect(() => {
    const fetchStrengthCardio = async () => {
      setStrengthCardioLoading(true);
      try {
        const metric = strengthCardioMetric === 'duration' ? 'total_duration_min' : 'total_sessions';
        const params = new URLSearchParams({
          view: 'workout_type',
          metric: metric,
          period: strengthCardioPeriod,
        });
        
        const res = await fetch(`/api/explore?${params.toString()}`);
        const data: ExploreResponse = await res.json();
        
        if (res.ok && data.data) {
          // Filter for strength and cardio types
          const filtered = data.data.filter(d => 
            d.workout_type === 'strength' || 
            d.workout_type === 'treadmill' || 
            d.workout_type === 'run' || 
            d.workout_type === 'walk'
          );
          console.log('Strength/Cardio raw data:', data.data);
          console.log('Strength/Cardio filtered data:', filtered);
          setStrengthCardioData(filtered);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          }
        } else {
          console.error('Failed to fetch strength/cardio data:', data);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          }
        }
      } catch (err) {
        console.error('Failed to fetch strength/cardio data:', err);
      } finally {
        setStrengthCardioLoading(false);
      }
    };
    
    fetchStrengthCardio();
  }, [strengthCardioPeriod, strengthCardioMetric]);

  // Fetch muscle group data
  useEffect(() => {
    const fetchMuscleGroups = async () => {
      setMuscleGroupLoading(true);
      try {
        const params = new URLSearchParams({
          view: 'muscle_group',
          metric: muscleGroupMetric,
          period: muscleGroupPeriod,
        });
        
        const res = await fetch(`/api/explore?${params.toString()}`);
        const data: ExploreResponse = await res.json();
        
        if (res.ok && data.data) {
          console.log('Muscle group data:', data.data);
          console.log('Muscle group data length:', data.data.length);
          if (data.data.length === 0) {
            console.warn('No muscle group data returned from API');
          }
          setMuscleGroupData(data.data);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          }
        } else {
          console.error('Failed to fetch muscle group data:', data);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          } else {
            setError('Failed to fetch muscle group data. Check console for details.');
          }
        }
      } catch (err) {
        console.error('Failed to fetch muscle group data:', err);
      } finally {
        setMuscleGroupLoading(false);
      }
    };
    
    fetchMuscleGroups();
  }, [muscleGroupPeriod, muscleGroupMetric]);

  // Fetch exercise progression data
  useEffect(() => {
    if (!selectedExercise) return;
    
    const fetchExerciseProgression = async () => {
      setExerciseLoading(true);
      try {
        const params = new URLSearchParams({
          view: 'exercise',
          metric: exerciseMetric,
          period: exercisePeriod,
          exercise_name: selectedExercise,
        });
        
        const res = await fetch(`/api/explore?${params.toString()}`);
        const data: ExploreResponse = await res.json();
        
        if (res.ok && data.data) {
          console.log('Exercise progression data:', data.data);
          console.log('Exercise progression data length:', data.data.length);
          if (data.data.length === 0) {
            console.warn(`No exercise progression data for exercise: ${selectedExercise}`);
          }
          setExerciseData(data.data);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          }
        } else {
          console.error('Failed to fetch exercise progression:', data);
          if (data.error) {
            setError(data.error + (data.hint ? ` (${data.hint})` : ''));
          } else {
            setError('Failed to fetch exercise progression data. Check console for details.');
          }
        }
      } catch (err) {
        console.error('Failed to fetch exercise progression:', err);
      } finally {
        setExerciseLoading(false);
      }
    };
    
    fetchExerciseProgression();
  }, [selectedExercise, exercisePeriod, exerciseMetric]);

  // Check if tables need to be built and build them automatically
  useEffect(() => {
    const checkAndBuildTables = async () => {
      try {
        const res = await fetch('/api/build-tables');
        const data = await res.json();
        if (data.needsBuild) {
          // Automatically build tables
          setBuildingTables(true);
          setError('Building derived tables automatically...');
          
          const buildRes = await fetch('/api/build-tables', { method: 'POST' });
          const buildData = await buildRes.json();
          
          if (buildRes.ok && buildData.success) {
            setTablesNeedBuild(false);
            setError(null);
            // Reload data after building tables
            window.location.reload();
          } else {
            setError(buildData.error || 'Failed to build tables automatically. Please try again.');
            setBuildingTables(false);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to check/build tables:', err);
        setError(err instanceof Error ? err.message : 'Failed to build tables');
        setBuildingTables(false);
      }
    };
    checkAndBuildTables();
  }, []);

  // Function to build tables
  const buildTables = async () => {
    setBuildingTables(true);
    setError(null);
    try {
      const res = await fetch('/api/build-tables', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setTablesNeedBuild(false);
        setError(null);
        // Reload data after building tables
        window.location.reload();
      } else {
        setError(data.error || 'Failed to build tables');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build tables');
    } finally {
      setBuildingTables(false);
    }
  };

  // Process strength vs cardio data for chart
  const processStrengthCardioData = () => {
    if (!strengthCardioData || strengthCardioData.length === 0) {
      console.log('No strength/cardio data to process');
      return [];
    }
    
    console.log(`Processing data for metric: ${strengthCardioMetric}, data points: ${strengthCardioData.length}`);
    
    const grouped: Record<string, { strength: number; cardio: number }> = {};
    
    strengthCardioData.forEach((d, index) => {
      const dateKey = d.week_start_date || d.month_start_date || '';
      if (!dateKey) {
        console.warn('Skipping entry with no date:', d);
        return;
      }
      
      // Always create the grouped entry for this date
      if (!grouped[dateKey]) {
        grouped[dateKey] = { strength: 0, cardio: 0 };
      }
      
      // Get the metric value - prioritize the direct field since it's in the API response
      // The API returns all columns, so total_duration_min and total_sessions are available
      let metricValue: number = 0;
      
      if (strengthCardioMetric === 'duration') {
        // For duration, use total_duration_min directly (prefer over value field)
        metricValue = d.total_duration_min ?? d.value ?? 0;
      } else {
        // For sessions, use total_sessions directly (prefer over value field)
        metricValue = d.total_sessions ?? d.value ?? 0;
      }
      
      // Log first few entries for debugging
      if (index < 3) {
        console.log(`Entry ${index}:`, {
          workout_type: d.workout_type,
          dateKey,
          value: d.value,
          total_duration_min: d.total_duration_min,
          total_sessions: d.total_sessions,
          selectedMetric: strengthCardioMetric,
          finalMetricValue: metricValue,
        });
      }
      
      // Convert to number if it's a string
      metricValue = typeof metricValue === 'string' ? parseFloat(metricValue) : metricValue;
      metricValue = isNaN(metricValue) ? 0 : metricValue;
      
      // Add the value (including 0) - this ensures all dates appear in the chart
      if (d.workout_type === 'strength') {
        grouped[dateKey].strength += metricValue;
      } else {
        grouped[dateKey].cardio += metricValue;
      }
    });
    
    // Include all dates in the result (even if values are 0, so user can see there's no duration data)
    const result = Object.entries(grouped)
      .map(([date, values]) => {
        // For duration, keep at least 1 decimal place for precision; for sessions, round to whole numbers
        const strengthValue = strengthCardioMetric === 'duration' 
          ? Math.round(values.strength * 10) / 10  // Keep 1 decimal for minutes
          : Math.round(values.strength);
        const cardioValue = strengthCardioMetric === 'duration'
          ? Math.round(values.cardio * 10) / 10  // Keep 1 decimal for minutes
          : Math.round(values.cardio);
        
        return {
          date,
          label: strengthCardioPeriod === 'week' ? formatWeekLabel(date) : formatMonthLabel(date),
          strength: strengthValue,
          cardio: cardioValue,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Debug log to verify data structure
    console.log(`Processed strength/cardio chart data (metric: ${strengthCardioMetric}):`, {
      inputDataLength: strengthCardioData.length,
      groupedEntries: Object.keys(grouped).length,
      resultLength: result.length,
      firstFewGrouped: Object.entries(grouped).slice(0, 3).map(([date, values]) => ({ date, ...values })),
      firstEntry: result[0],
      sampleInputData: strengthCardioData.slice(0, 5).map(d => ({
        workout_type: d.workout_type,
        value: d.value,
        total_duration_min: d.total_duration_min,
        total_sessions: d.total_sessions,
        week_start_date: d.week_start_date,
        month_start_date: d.month_start_date,
      })),
    });
    
    if (result.length === 0 && strengthCardioData.length > 0) {
      console.warn('No valid data points after processing. All values may be zero or invalid.');
    }
    
    return result;
  };

  // Process muscle group data for chart
  const processMuscleGroupData = () => {
    if (!muscleGroupData || muscleGroupData.length === 0) {
      return [];
    }
    
    if (muscleGroupView === 'upper_lower') {
      const grouped: Record<string, { upper: number; lower: number }> = {};
      
      muscleGroupData.forEach(d => {
        const dateKey = d.week_start_date || d.month_start_date || '';
        if (!dateKey) return;
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = { upper: 0, lower: 0 };
        }
        
        const mg = d.muscle_group || '';
        if (muscleGroups.upper.includes(mg)) {
          grouped[dateKey].upper += d.value || 0;
        } else if (muscleGroups.lower.includes(mg)) {
          grouped[dateKey].lower += d.value || 0;
        }
      });
      
      return Object.entries(grouped)
        .map(([date, values]) => ({
          date,
          label: muscleGroupPeriod === 'week' ? formatWeekLabel(date) : formatMonthLabel(date),
          upper: Math.round(values.upper),
          lower: Math.round(values.lower),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // Individual groups
      const grouped: Record<string, Record<string, number>> = {};
      
      muscleGroupData.forEach(d => {
        const dateKey = d.week_start_date || d.month_start_date || '';
        if (!dateKey) return;
        
        const mg = d.muscle_group || '';
        if (!grouped[dateKey]) {
          grouped[dateKey] = {};
        }
        grouped[dateKey][mg] = (grouped[dateKey][mg] || 0) + (d.value || 0);
      });
      
      // Get all unique muscle groups
      const allGroups = new Set<string>();
      Object.values(grouped).forEach(g => {
        Object.keys(g).forEach(mg => allGroups.add(mg));
      });
      
      return Object.entries(grouped)
        .map(([date, values]) => {
          const result: any = {
            date,
            label: muscleGroupPeriod === 'week' ? formatWeekLabel(date) : formatMonthLabel(date),
          };
          allGroups.forEach(mg => {
            result[mg] = Math.round(values[mg] || 0);
          });
          return result;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  };

  // Process exercise progression data
  const processExerciseData = () => {
    if (!exerciseData || exerciseData.length === 0) {
      return [];
    }
    
    return exerciseData
      .filter(d => {
        const date = d.week_start_date || d.month_start_date || '';
        return date !== '';
      })
      .map(d => {
        const date = d.week_start_date || d.month_start_date || '';
        return {
          date,
          label: exercisePeriod === 'week' ? formatWeekLabel(date) : formatMonthLabel(date),
          value: Math.round(d.value || 0),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (buildingTables || (error && error.includes('Building'))) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-2">Setting Up</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <p className="text-blue-700 dark:text-blue-300 font-medium">
                Building derived tables automatically...
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                This may take a minute. Please wait.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button
            onClick={buildTables}
            disabled={buildingTables}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            Retry Building Tables
          </button>
        </div>
      </div>
    );
  }

  const strengthCardioChartData = processStrengthCardioData();
  const muscleGroupChartData = processMuscleGroupData();
  const exerciseChartData = processExerciseData();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track your strength training and cardio progress over time
        </p>
      </div>

      {/* Section 1: Strength vs Cardio Comparison */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Strength vs Cardio</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Compare {strengthCardioMetric === 'duration' ? 'time spent' : 'number of sessions'} on strength training versus cardio workouts
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={strengthCardioMetric}
              onChange={(e) => setStrengthCardioMetric(e.target.value as 'duration' | 'sessions')}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="duration">Duration (min)</option>
              <option value="sessions">Sessions</option>
            </select>
            <button
              onClick={() => setStrengthCardioPeriod('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                strengthCardioPeriod === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setStrengthCardioPeriod('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                strengthCardioPeriod === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Month
            </button>
          </div>
        </div>
        {strengthCardioLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : strengthCardioChartData.length > 0 ? (
          <>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Showing {strengthCardioChartData.length} {strengthCardioPeriod === 'week' ? 'weeks' : 'months'} of data
              {strengthCardioMetric === 'duration' && strengthCardioChartData.every(d => d.strength === 0 && d.cardio === 0) && (
                <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                  ⚠️ All duration values are zero - duration data may not be available in your database
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={strengthCardioChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis 
                  stroke="#6b7280" 
                  fontSize={12}
                  label={{ 
                    value: strengthCardioMetric === 'duration' ? 'Duration (min)' : 'Sessions', 
                    angle: -90, 
                    position: 'insideLeft', 
                    style: { textAnchor: 'middle' } 
                  }}
                  tickFormatter={(value) => formatNumberWithSeparators(value)}
                />
                <Tooltip 
                  content={<CustomTooltip 
                    labelFormatter={(label) => strengthCardioPeriod === 'week' ? `Week of ${label}` : label}
                    formatter={(value, name) => {
                      const formattedValue = formatNumberWithSeparators(value);
                      const isSessions = strengthCardioMetric === 'sessions';
                      const unit = isSessions ? '' : ' min';
                      const label = name === 'strength' 
                        ? (isSessions ? 'Strength Sessions' : 'Strength Duration')
                        : (isSessions ? 'Cardio Sessions' : 'Cardio Duration');
                      return [`${formattedValue}${unit}`, label];
                    }}
                  />}
                />
                <Legend />
                <Bar dataKey="strength" fill="#3b82f6" name={strengthCardioMetric === 'duration' ? 'Strength (min)' : 'Strength Sessions'} />
                <Bar dataKey="cardio" fill="#10b981" name={strengthCardioMetric === 'duration' ? 'Cardio (min)' : 'Cardio Sessions'} />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : strengthCardioData.length > 0 ? (
          <div className="h-64 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
            Data available but no matching workout types found. Check console for details.
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p className="mb-2">No data available</p>
            <p className="text-xs text-center px-4">
              Make sure you've run the build_derived_tables.py script to create the fact tables.
            </p>
          </div>
        )}
      </div>

      {/* Section 2: Muscle Group Analysis */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Muscle Group Analysis</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track training volume by muscle group to ensure balanced development. {getMetricDescription(muscleGroupMetric)}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={muscleGroupMetric}
              onChange={(e) => setMuscleGroupMetric(e.target.value as any)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="total_tonnage">Tonnage</option>
              <option value="total_sets">Sets</option>
              <option value="total_reps">Reps</option>
            </select>
            <button
              onClick={() => setMuscleGroupView('upper_lower')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                muscleGroupView === 'upper_lower'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Upper/Lower
            </button>
            <button
              onClick={() => setMuscleGroupView('individual')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                muscleGroupView === 'individual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setMuscleGroupPeriod('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                muscleGroupPeriod === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setMuscleGroupPeriod('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                muscleGroupPeriod === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Month
            </button>
          </div>
        </div>
        {muscleGroupLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : muscleGroupChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            {muscleGroupView === 'upper_lower' ? (
              <BarChart data={muscleGroupChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis 
                  stroke="#6b7280" 
                  fontSize={12}
                  label={{ value: getMetricDisplayName(muscleGroupMetric), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  tickFormatter={(value) => formatNumberWithSeparators(value)}
                />
                <Tooltip 
                  content={<CustomTooltip 
                    labelFormatter={(label) => muscleGroupPeriod === 'week' ? `Week of ${label}` : label}
                    formatter={(value, name) => {
                      const formattedValue = formatNumberWithSeparators(value);
                      const displayName = getMetricDisplayName(muscleGroupMetric);
                      return [formattedValue, name === 'upper' ? `Upper Body (${displayName})` : `Lower Body (${displayName})`];
                    }}
                  />}
                />
                <Legend />
                <Bar dataKey="upper" fill="#3b82f6" name={`Upper Body (${getMetricDisplayName(muscleGroupMetric)})`} />
                <Bar dataKey="lower" fill="#10b981" name={`Lower Body (${getMetricDisplayName(muscleGroupMetric)})`} />
              </BarChart>
            ) : (
              <BarChart data={muscleGroupChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis 
                  stroke="#6b7280" 
                  fontSize={12}
                  label={{ value: getMetricDisplayName(muscleGroupMetric), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  tickFormatter={(value) => formatNumberWithSeparators(value)}
                />
                <Tooltip 
                  content={<CustomTooltip 
                    labelFormatter={(label) => muscleGroupPeriod === 'week' ? `Week of ${label}` : label}
                    formatter={(value, name) => {
                      const formattedValue = formatNumberWithSeparators(value);
                      const displayName = getMetricDisplayName(muscleGroupMetric);
                      return [formattedValue, `${name.charAt(0).toUpperCase() + name.slice(1)} (${displayName})`];
                    }}
                  />}
                />
                <Legend />
                {muscleGroups.upper.concat(muscleGroups.lower, muscleGroups.other).map((mg, idx) => (
                  <Bar key={mg} dataKey={mg} stackId="a" fill={`hsl(${idx * 30}, 70%, 50%)`} name={`${mg.charAt(0).toUpperCase() + mg.slice(1)} (${getMetricDisplayName(muscleGroupMetric)})`} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p className="mb-2">No data available</p>
            <p className="text-xs text-center px-4">
              Make sure you've run the build_derived_tables.py script to create the fact tables.
            </p>
          </div>
        )}
      </div>

      {/* Section 3: Exercise Progression */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Exercise Progression</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track your progress on specific exercises over time. {getMetricDescription(exerciseMetric)}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {exercises.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
            <select
              value={exerciseMetric}
              onChange={(e) => setExerciseMetric(e.target.value as any)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="total_tonnage">Tonnage</option>
              <option value="total_sets">Sets</option>
              <option value="total_reps">Reps</option>
            </select>
            <button
              onClick={() => setExercisePeriod('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                exercisePeriod === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setExercisePeriod('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                exercisePeriod === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Month
            </button>
          </div>
        </div>
        {exerciseLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : exerciseChartData.length > 0 ? (
          <>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Showing progression for <span className="font-semibold">{selectedExercise}</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={exerciseChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis 
                  stroke="#6b7280" 
                  fontSize={12}
                  label={{ value: getMetricDisplayName(exerciseMetric), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  tickFormatter={(value) => formatNumberWithSeparators(value)}
                />
                <Tooltip 
                  content={<CustomTooltip 
                    labelFormatter={(label) => exercisePeriod === 'week' ? `Week of ${label}` : label}
                    formatter={(value, name) => {
                      const formattedValue = formatNumberWithSeparators(value);
                      const displayName = getMetricDisplayName(exerciseMetric);
                      return [formattedValue, `${selectedExercise} - ${displayName}`];
                    }}
                  />}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  name={getMetricDisplayName(exerciseMetric)}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            {selectedExercise ? 'No data available for this exercise' : 'Select an exercise to view progression'}
          </div>
        )}
      </div>
    </div>
  );
}
