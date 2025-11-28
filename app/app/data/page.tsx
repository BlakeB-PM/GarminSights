'use client';

import { useState, useEffect, useMemo } from 'react';

interface DailyDataRow {
  [key: string]: any;
}

interface DailyDataResponse {
  data: DailyDataRow[];
  meta: {
    table: string;
    columns: string[];
    count: number;
    startDate: string | null;
    endDate: string | null;
  };
}

// Column categories for organization
const columnCategories = {
  'Date': ['day'],
  'Activity': ['steps', 'steps_goal', 'steps_goal_percent', 'distance', 'floors', 'floors_goal', 'floors_goal_percent', 'intensity_time', 'moderate_activity_time', 'vigorous_activity_time', 'intensity_time_goal'],
  'Calories': ['calories_avg', 'calories_bmr_avg', 'calories_active_avg', 'calories_consumed_avg', 'calories_goal', 'activities_calories'],
  'Sleep': ['sleep_avg', 'sleep_min', 'sleep_max', 'rem_sleep_avg', 'rem_sleep_min', 'rem_sleep_max'],
  'Heart Rate': ['hr_avg', 'hr_min', 'hr_max', 'rhr_avg', 'rhr_min', 'rhr_max', 'inactive_hr_avg', 'inactive_hr_min', 'inactive_hr_max'],
  'Stress & Recovery': ['stress_avg', 'bb_max', 'bb_min'],
  'Activities': ['activities', 'activities_distance'],
  'Other': ['weight_avg', 'weight_min', 'weight_max', 'hydration_goal', 'hydration_avg', 'hydration_intake', 'sweat_loss_avg', 'sweat_loss', 'spo2_avg', 'spo2_min', 'rr_waking_avg', 'rr_max', 'rr_min']
};

// Get category for a column
const getColumnCategory = (col: string): string => {
  for (const [category, columns] of Object.entries(columnCategories)) {
    if (columns.includes(col)) {
      return category;
    }
  }
  return 'Other';
};

// Get human-readable column name
const getColumnDisplayName = (col: string): string => {
  const nameMap: { [key: string]: string } = {
    'day': 'Date',
    'steps': 'Steps',
    'steps_goal': 'Steps Goal',
    'steps_goal_percent': 'Steps Goal %',
    'distance': 'Distance',
    'floors': 'Floors',
    'floors_goal': 'Floors Goal',
    'floors_goal_percent': 'Floors Goal %',
    'intensity_time': 'Intensity Time',
    'moderate_activity_time': 'Moderate Activity',
    'vigorous_activity_time': 'Vigorous Activity',
    'intensity_time_goal': 'Intensity Goal',
    'calories_avg': 'Calories',
    'calories_bmr_avg': 'BMR Calories',
    'calories_active_avg': 'Active Calories',
    'calories_consumed_avg': 'Consumed Calories',
    'calories_goal': 'Calories Goal',
    'activities_calories': 'Activity Calories',
    'sleep_avg': 'Sleep',
    'sleep_min': 'Sleep Min',
    'sleep_max': 'Sleep Max',
    'rem_sleep_avg': 'REM Sleep',
    'rem_sleep_min': 'REM Min',
    'rem_sleep_max': 'REM Max',
    'hr_avg': 'Avg Heart Rate',
    'hr_min': 'Min Heart Rate',
    'hr_max': 'Max Heart Rate',
    'rhr_avg': 'Resting HR',
    'rhr_min': 'RHR Min',
    'rhr_max': 'RHR Max',
    'inactive_hr_avg': 'Inactive HR',
    'inactive_hr_min': 'Inactive HR Min',
    'inactive_hr_max': 'Inactive HR Max',
    'stress_avg': 'Stress',
    'bb_max': 'Body Battery Max',
    'bb_min': 'Body Battery Min',
    'activities': 'Activities',
    'activities_distance': 'Activity Distance',
    'weight_avg': 'Weight',
    'weight_min': 'Weight Min',
    'weight_max': 'Weight Max',
    'hydration_goal': 'Hydration Goal',
    'hydration_avg': 'Hydration',
    'hydration_intake': 'Hydration Intake',
    'sweat_loss_avg': 'Sweat Loss',
    'sweat_loss': 'Sweat Loss',
    'spo2_avg': 'SpO2',
    'spo2_min': 'SpO2 Min',
    'rr_waking_avg': 'Respiration Rate',
    'rr_max': 'Respiration Max',
    'rr_min': 'Respiration Min',
  };
  
  return nameMap[col] || col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function DataPage() {
  const [data, setData] = useState<DailyDataRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [meta, setMeta] = useState<DailyDataResponse['meta'] | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      params.append('limit', '1000');
      
      const res = await fetch(`/api/daily-data?${params.toString()}`);
      const response: any = await res.json();
      
      if (!res.ok) {
        let errorMsg = response.error || 'Failed to fetch data';
        if (response.hint) {
          errorMsg += '\n\n' + response.hint;
        }
        if (response.suggestion) {
          errorMsg += '\n\n' + response.suggestion;
        }
        throw new Error(errorMsg);
      }
      
      setData(response.data);
      setColumns(response.meta.columns);
      setMeta(response.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Get most recent day's data for metrics cards
  const latestData = useMemo(() => {
    if (data.length === 0) return null;
    return data[0]; // Data is sorted DESC by day
  }, [data]);

  // Quick date range filters
  const setQuickFilter = (range: 'today' | 'week' | 'month' | '30days') => {
    const today = new Date();
    const end = today.toISOString().split('T')[0];
    let start: string;
    
    switch (range) {
      case 'today':
        start = end;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        start = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        start = monthAgo.toISOString().split('T')[0];
        break;
      case '30days':
        const daysAgo = new Date(today);
        daysAgo.setDate(today.getDate() - 30);
        start = daysAgo.toISOString().split('T')[0];
        break;
    }
    
    setStartDate(start);
    setEndDate(end);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;
    
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    let comparison = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }
    
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const filteredData = sortedData.filter(row => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return Object.values(row).some(val => 
      val !== null && String(val).toLowerCase().includes(searchLower)
    );
  });

  const formatValue = (value: any, column: string): string => {
    if (value === null || value === undefined) return '-';
    
    // Format dates
    if (column === 'day' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(value).toLocaleDateString();
    }
    
    // Format numbers
    if (typeof value === 'number') {
      if (value > 1000) {
        return value.toLocaleString();
      }
      if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    
    // Format time values (HH:MM:SS)
    if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}/.test(value)) {
      return value.substring(0, 8);
    }
    
    return String(value);
  };

  // Format time for display (HH:MM from HH:MM:SS)
  const formatTime = (value: any): string => {
    if (!value) return '-';
    if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}/.test(value)) {
      return value.substring(0, 5); // HH:MM
    }
    return String(value);
  };

  // Organize columns by category
  const organizedColumns = useMemo(() => {
    const organized: { [category: string]: string[] } = {};
    
    columns.forEach(col => {
      const category = getColumnCategory(col);
      if (!organized[category]) {
        organized[category] = [];
      }
      organized[category].push(col);
    });
    
    // Return in order of category preference
    const categoryOrder = ['Date', 'Activity', 'Calories', 'Sleep', 'Heart Rate', 'Stress & Recovery', 'Activities', 'Other'];
    const result: string[] = [];
    
    categoryOrder.forEach(cat => {
      if (organized[cat]) {
        result.push(...organized[cat]);
      }
    });
    
    // Add any remaining columns
    Object.keys(organized).forEach(cat => {
      if (!categoryOrder.includes(cat)) {
        result.push(...organized[cat]);
      }
    });
    
    return result;
  }, [columns]);

  return (
    <main className="container mx-auto p-4 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Daily Data Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Comprehensive view of all your Garmin health and activity data
        </p>
      </div>

      {/* Key Metrics Cards */}
      {latestData && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Steps</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {latestData.steps ? latestData.steps.toLocaleString() : '-'}
            </div>
            {latestData.steps_goal && (
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Goal: {latestData.steps_goal.toLocaleString()}
              </div>
            )}
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sleep</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatTime(latestData.sleep_avg)}
            </div>
            {latestData.rem_sleep_avg && (
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                REM: {formatTime(latestData.rem_sleep_avg)}
              </div>
            )}
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Heart Rate</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {latestData.hr_avg ? `${Math.round(latestData.hr_avg)} bpm` : '-'}
            </div>
            {latestData.rhr_avg && (
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Resting: {Math.round(latestData.rhr_avg)} bpm
              </div>
            )}
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Stress</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {latestData.stress_avg ? `${Math.round(latestData.stress_avg)}` : '-'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">Average</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Body Battery</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {latestData.bb_max && latestData.bb_min 
                ? `${latestData.bb_min}-${latestData.bb_max}` 
                : '-'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">Min-Max</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setQuickFilter('today')}
              className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setQuickFilter('week')}
              className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              This Week
            </button>
            <button
              onClick={() => setQuickFilter('month')}
              className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => setQuickFilter('30days')}
              className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium mb-2">
              Start Date
            </label>
            <input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="search" className="block text-sm font-medium mb-2">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search values..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchData}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Refresh Data
            </button>
          </div>
        </div>
        
        {meta && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredData.length} of {meta.count} records from {meta.table} table
            {meta.startDate && meta.endDate && ` (${meta.startDate} to ${meta.endDate})`}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-600 dark:text-red-300 mb-3 whitespace-pre-line">{error}</p>
          <div className="mt-4 pt-4 border-t border-red-200 dark:border-red-700">
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">Troubleshooting:</p>
            <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
              <li>Make sure you've synced your Garmin data using the sync feature in the Explorer page</li>
              <li>The sync process needs to run with the --analyze flag to create summary tables</li>
              <li>If you just synced, wait a moment and refresh this page</li>
            </ul>
            <button
              onClick={() => {
                window.open('/api/daily-data?debug=true', '_blank');
              }}
              className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Debug: View all available tables →
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading data...</p>
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && data.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {organizedColumns.map((column) => {
                    const category = getColumnCategory(column);
                    const isCategoryHeader = organizedColumns.indexOf(column) === 0 || 
                      getColumnCategory(organizedColumns[organizedColumns.indexOf(column) - 1]) !== category;
                    
                    return (
                      <th
                        key={column}
                        onClick={() => handleSort(column)}
                        className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                          isCategoryHeader ? 'border-l-2 border-blue-500 dark:border-blue-400 pl-6' : ''
                        }`}
                        title={category}
                      >
                        <div className="flex items-center gap-2">
                          {getColumnDisplayName(column)}
                          {sortColumn === column && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.slice(0, 100).map((row, idx) => (
                  <tr 
                    key={idx} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {organizedColumns.map((column) => (
                      <td
                        key={column}
                        className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                      >
                        {formatValue(row[column], column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredData.length > 100 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
              Showing first 100 rows. Use date filters to narrow down results.
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            No data found
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">
            Try adjusting your date filters or sync your Garmin data first.
          </p>
        </div>
      )}
    </main>
  );
}
