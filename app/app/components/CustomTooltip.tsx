'use client';

import React from 'react';
import { getMetricDisplayName } from '../lib/training-utils';

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: number, name: string) => [string, string];
  labelFormatter?: (label: string) => string;
}

/**
 * Format a number with thousand separators
 */
function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  if (num % 1 !== 0) {
    // Has decimals, show up to 2 decimal places
    return num.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }
  return num.toLocaleString('en-US');
}

/**
 * Extract metric name from a payload entry and format its display name
 */
function getFormattedMetricName(name: string): string {
  // If it already looks formatted, return as-is
  if (name.includes('(') || name.includes('min') || name.includes('lbs')) {
    return name;
  }
  
  // Try to map common data keys to metrics
  const metricMap: Record<string, string> = {
    'strength': 'Duration (min)',
    'cardio': 'Duration (min)',
    'strengthSessions': 'Sessions',
    'cardioSessions': 'Sessions',
    'upper': 'Upper Body',
    'lower': 'Lower Body',
    'value': '', // Will be determined by context
  };
  
  if (metricMap[name]) {
    return metricMap[name];
  }
  
  return name;
}

export default function CustomTooltip({ 
  active, 
  payload, 
  label,
  formatter,
  labelFormatter 
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label || '') : label;

  // Filter out duplicate entries based on dataKey (Recharts sometimes sends duplicates)
  const uniqueEntries = payload.filter((entry, index, self) => {
    const dataKey = String(entry.dataKey || entry.name || index);
    return index === self.findIndex((e) => String(e.dataKey || e.name || index) === dataKey);
  });

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
      <p className="font-semibold text-gray-900 dark:text-white mb-2 text-sm border-b border-gray-200 dark:border-gray-700 pb-1">
        {formattedLabel}
      </p>
      <div className="space-y-1">
        {uniqueEntries.map((entry, index) => {
          const value = entry.value;
          // Prioritize dataKey over name for identification
          const dataKey = String(entry.dataKey || '');
          const name = String(entry.name || entry.dataKey || String(index));
          
          // Use custom formatter if provided
          let formattedValue: string;
          let formattedName: string;
          
          if (formatter && typeof formatter === 'function') {
            try {
              [formattedValue, formattedName] = formatter(value, dataKey || name);
            } catch (e) {
              formattedValue = formatNumber(value);
              formattedName = getFormattedMetricName(name);
            }
          } else {
            formattedValue = formatNumber(value);
            // Format based on dataKey for better context (dataKey is more reliable than name)
            const key = (dataKey || name).toLowerCase();
            if (key === 'strength') {
              formattedValue = `${formatNumber(value)} min`;
              formattedName = 'Strength Duration';
            } else if (key === 'cardio') {
              formattedValue = `${formatNumber(value)} min`;
              formattedName = 'Cardio Duration';
            } else if (key === 'strengthsessions' || key.includes('strength') && key.includes('session')) {
              formattedValue = formatNumber(value);
              formattedName = 'Strength Sessions';
            } else if (key === 'cardiosessions' || key.includes('cardio') && key.includes('session')) {
              formattedValue = formatNumber(value);
              formattedName = 'Cardio Sessions';
            } else {
              formattedName = getFormattedMetricName(name);
            }
          }
          
          return (
            <div key={`${dataKey || name}-${index}`} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-sm flex-shrink-0" 
                style={{ backgroundColor: entry.color || '#3b82f6' }}
              />
              <span className="text-gray-600 dark:text-gray-400 min-w-[100px]">
                {formattedName}:
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
