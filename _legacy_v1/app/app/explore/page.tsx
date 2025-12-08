'use client';

import { useState, useEffect } from 'react';

type ViewType = 'exercise' | 'muscle_group' | 'workout_type';

const METRICS: Record<ViewType, string[]> = {
  exercise: ['total_tonnage', 'total_sets', 'total_reps'],
  muscle_group: ['total_tonnage', 'total_sets', 'total_reps'],
  workout_type: ['total_duration_min', 'total_sessions', 'total_distance_km', 'total_tonnage'],
};

interface ApiResponse {
  data: any[];
  meta: {
    view: string;
    metric: string;
    period: string;
    count: number;
  };
}

interface ApiError {
  error: string;
}

export default function ExplorePage() {
  const [view, setView] = useState<ViewType>('exercise');
  const [metric, setMetric] = useState<string>('total_tonnage');
  const [exerciseName, setExerciseName] = useState<string>('');
  const [muscleGroup, setMuscleGroup] = useState<string>('');
  const [workoutType, setWorkoutType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Exercise dropdown state
  const [exercises, setExercises] = useState<string[]>([]);
  const [loadingExercises, setLoadingExercises] = useState<boolean>(false);

  // Fetch exercises from API
  useEffect(() => {
    const fetchExercises = async () => {
      setLoadingExercises(true);
      try {
        const res = await fetch('/api/exercises');
        const data = await res.json();
        if (res.ok && data.exercises) {
          setExercises(data.exercises);
        }
      } catch (err) {
        console.error('Failed to fetch exercises:', err);
      } finally {
        setLoadingExercises(false);
      }
    };
    
    if (view === 'exercise') {
      fetchExercises();
    }
  }, [view]);
  
  // Update metric when view changes to ensure it's valid
  const handleViewChange = (newView: ViewType) => {
    setView(newView);
    const validMetrics = METRICS[newView];
    if (!validMetrics.includes(metric)) {
      setMetric(validMetrics[0]);
    }
  };
  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const params = new URLSearchParams({
        view,
        metric,
        period: 'week',
      });

      if (exerciseName && view === 'exercise') {
        params.append('exercise_name', exerciseName);
      }
      if (muscleGroup && (view === 'exercise' || view === 'muscle_group')) {
        params.append('muscle_group', muscleGroup);
      }
      if (workoutType && view === 'workout_type') {
        params.append('workout_type', workoutType);
      }
      if (startDate) {
        params.append('start', startDate);
      }
      if (endDate) {
        params.append('end', endDate);
      }

      const res = await fetch(`/api/explore?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError((data as ApiError).error || 'An error occurred');
        return;
      }

      setResponse(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Training Explorer</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Explore your strength training progression and workout analysis
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* View Selector */}
          <div>
            <label htmlFor="view" className="block text-sm font-medium mb-2">
              View By
            </label>
            <select
              id="view"
              value={view}
              onChange={(e) => handleViewChange(e.target.value as ViewType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="exercise">Exercise</option>
              <option value="muscle_group">Muscle Group</option>
              <option value="workout_type">Workout Type</option>
            </select>
          </div>

          {/* Metric Selector */}
          <div>
            <label htmlFor="metric" className="block text-sm font-medium mb-2">
              Metric
            </label>
            <select
              id="metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {METRICS[view].map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {/* Exercise Name Filter (only for exercise view) */}
          {view === 'exercise' && (
            <div>
              <label htmlFor="exercise_name" className="block text-sm font-medium mb-2">
                Exercise Name (optional)
              </label>
              <select
                id="exercise_name"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                disabled={loadingExercises}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">-- Select Exercise --</option>
                {exercises.map((exercise) => (
                  <option key={exercise} value={exercise}>
                    {exercise}
                  </option>
                ))}
              </select>
              {loadingExercises && (
                <p className="text-xs text-gray-500 mt-1">Loading exercises...</p>
              )}
              {!loadingExercises && exercises.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">No exercises found. Sync your Garmin data first.</p>
              )}
            </div>
          )}

          {/* Muscle Group Filter (for exercise and muscle_group views) */}
          {(view === 'exercise' || view === 'muscle_group') && (
            <div>
              <label htmlFor="muscle_group" className="block text-sm font-medium mb-2">
                Muscle Group (optional)
              </label>
              <input
                id="muscle_group"
                type="text"
                value={muscleGroup}
                onChange={(e) => setMuscleGroup(e.target.value)}
                placeholder="e.g., chest, back, legs"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          )}

          {/* Workout Type Filter (only for workout_type view) */}
          {view === 'workout_type' && (
            <div>
              <label htmlFor="workout_type" className="block text-sm font-medium mb-2">
                Workout Type (optional)
              </label>
              <input
                id="workout_type"
                type="text"
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value)}
                placeholder="e.g., strength, treadmill, run"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          )}

          {/* Start Date */}
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium mb-2">
              Start Date (optional)
            </label>
            <input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* End Date */}
          <div>
            <label htmlFor="end_date" className="block text-sm font-medium mb-2">
              End Date (optional)
            </label>
            <input
              id="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
        >
          {loading ? 'Loading...' : 'Run Query'}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Response Display */}
      {response && (
        <div className="space-y-4">
          {/* Metadata Summary */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Query Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">View:</span>{' '}
                <span className="text-blue-600 dark:text-blue-400">{response.meta.view}</span>
              </div>
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">Metric:</span>{' '}
                <span className="text-blue-600 dark:text-blue-400">{response.meta.metric}</span>
              </div>
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">Period:</span>{' '}
                <span className="text-blue-600 dark:text-blue-400">{response.meta.period}</span>
              </div>
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">Records:</span>{' '}
                <span className="text-blue-600 dark:text-blue-400">{response.meta.count}</span>
              </div>
            </div>
          </div>

          {/* Sample Data Preview */}
          {response.data.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-2">Sample Data (First 5 records)</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {Object.keys(response.data[0]).map((key) => (
                        <th key={key} className="text-left py-2 px-4 font-medium text-gray-700 dark:text-gray-300">
                          {key.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {response.data.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                        {Object.values(row).map((value, colIdx) => (
                          <td key={colIdx} className="py-2 px-4 text-gray-600 dark:text-gray-400">
                            {typeof value === 'number' ? value.toLocaleString() : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* JSON Response */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-2">Full JSON Response</h2>
            <pre className="overflow-x-auto text-xs bg-white dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!response && !error && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-semibold mb-2">How to Use</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
            <li>Select a <strong>View By</strong> option (exercise, muscle group, or workout type)</li>
            <li>Choose a <strong>Metric</strong> to display</li>
            <li>Optionally add filters (exercise name, muscle group, or date range)</li>
            <li>Click <strong>Run Query</strong> to fetch data from the API</li>
            <li>View the results below: metadata summary, sample data table, and full JSON response</li>
          </ol>
        </div>
      )}
    </main>
  );
}
