'use client';

import { useState, useEffect } from 'react';
import { formatWorkoutDuration, timeStringToMinutes } from '../lib/training-utils';

interface ExerciseSet {
  reps: number;
  weight: number;
}

interface Exercise {
  name: string;
  sets: ExerciseSet[];
  totalTonnage: number;
  totalSets: number;
  totalReps: number;
}

interface Workout {
  activityId: string;
  name: string | null;
  sport: string | null;
  subSport: string | null;
  startTime: string | null;
  stopTime: string | null;
  duration: string | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  trainingLoad: number | null;
  trainingEffect: number | null;
  exercises: Exercise[];
}

interface WorkoutsResponse {
  workouts: Workout[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sport, setSport] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });

  const fetchWorkouts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      if (sport) params.append('sport', sport);
      
      const res = await fetch(`/api/workouts?${params.toString()}`);
      const data: WorkoutsResponse = await res.json();
      
      if (res.ok) {
        setWorkouts(data.workouts);
        setPagination(data.pagination);
      } else {
        setError(data.error || 'Failed to fetch workouts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, [page, startDate, endDate, sport]);

  const toggleWorkout = (activityId: string) => {
    const newExpanded = new Set(expandedWorkouts);
    if (newExpanded.has(activityId)) {
      newExpanded.delete(activityId);
    } else {
      newExpanded.add(activityId);
    }
    setExpandedWorkouts(newExpanded);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (duration: string | null) => {
    if (!duration) return '-';
    const minutes = timeStringToMinutes(duration);
    return formatWorkoutDuration(minutes);
  };

  return (
    <main className="container mx-auto p-4 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Workouts</h1>
        <p className="text-gray-600 dark:text-gray-400">
          View detailed information about all your recorded workouts
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium mb-2">
              Start Date
            </label>
            <input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="end_date" className="block text-sm font-medium mb-2">
              End Date
            </label>
            <input
              id="end_date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="sport" className="block text-sm font-medium mb-2">
              Sport Type
            </label>
            <input
              id="sport"
              type="text"
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                setPage(1);
              }}
              placeholder="e.g., strength_training, running"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSport('');
                setPage(1);
              }}
              className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium rounded-md transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
        
        {pagination.total > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {((page - 1) * pagination.limit) + 1} - {Math.min(page * pagination.limit, pagination.total)} of {pagination.total} workouts
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading workouts...</p>
        </div>
      )}

      {/* Workouts List */}
      {!loading && !error && (
        <>
          <div className="space-y-4">
            {workouts.map((workout) => {
              const isExpanded = expandedWorkouts.has(workout.activityId);
              const hasExercises = workout.exercises.length > 0;
              
              return (
                <div
                  key={workout.activityId}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => toggleWorkout(workout.activityId)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {workout.name || 'Untitled Workout'}
                          </h3>
                          {hasExercises && (
                            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded">
                              {workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Date</span>
                            <p className="text-gray-900 dark:text-white font-medium">{formatDate(workout.startTime)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Sport</span>
                            <p className="text-gray-900 dark:text-white font-medium">
                              {workout.sport || workout.subSport || '-'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Duration</span>
                            <p className="text-gray-900 dark:text-white font-medium">{formatDuration(workout.duration)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Calories</span>
                            <p className="text-gray-900 dark:text-white font-medium">
                              {workout.calories ? workout.calories.toLocaleString() : '-'}
                            </p>
                          </div>
                        </div>
                        {(workout.avgHr || workout.maxHr || workout.trainingLoad || workout.trainingEffect) && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
                            {workout.avgHr && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Avg HR</span>
                                <p className="text-gray-900 dark:text-white font-medium">{workout.avgHr} bpm</p>
                              </div>
                            )}
                            {workout.maxHr && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Max HR</span>
                                <p className="text-gray-900 dark:text-white font-medium">{workout.maxHr} bpm</p>
                              </div>
                            )}
                            {workout.trainingLoad && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Training Load</span>
                                <p className="text-gray-900 dark:text-white font-medium">{workout.trainingLoad.toFixed(1)}</p>
                              </div>
                            )}
                            {workout.trainingEffect && (
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Training Effect</span>
                                <p className="text-gray-900 dark:text-white font-medium">{workout.trainingEffect.toFixed(1)}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <svg
                          className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && hasExercises && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900/50">
                      <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Exercises</h4>
                      <div className="space-y-4">
                        {workout.exercises.map((exercise, idx) => (
                          <div
                            key={idx}
                            className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium text-gray-900 dark:text-white">{exercise.name}</h5>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {exercise.totalSets} {exercise.totalSets === 1 ? 'set' : 'sets'} • {exercise.totalReps} reps • {Math.round(exercise.totalTonnage)} lbs total
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              {exercise.sets.map((set, setIdx) => (
                                <div
                                  key={setIdx}
                                  className="bg-gray-50 dark:bg-gray-700 rounded p-2 text-center"
                                >
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {set.reps} × {set.weight} lbs
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {isExpanded && !hasExercises && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900/50">
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        No exercise details available for this workout. Exercise data is only available for strength training workouts with JSON files.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-gray-100 font-medium rounded-md transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-gray-100 font-medium rounded-md transition-colors"
              >
                Next
              </button>
            </div>
          )}

          {workouts.length === 0 && !loading && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                No workouts found
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm">
                Try adjusting your filters or sync your Garmin data first.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

