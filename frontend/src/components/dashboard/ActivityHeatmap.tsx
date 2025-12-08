import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { cn } from '../../lib/utils';
import type { ActivityHeatmapDay } from '../../lib/api';

interface ActivityHeatmapProps {
  data: ActivityHeatmapDay[];
  days?: number;
}

export function ActivityHeatmap({ data, days = 30 }: ActivityHeatmapProps) {
  // Generate a grid of the last N days
  const grid = useMemo(() => {
    const result: Array<{ date: string; count: number; minutes: number; hasData: boolean }> = [];
    const dataMap = new Map(data.map(d => [d.date, d]));
    
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dataMap.get(dateStr);
      
      result.push({
        date: dateStr,
        count: dayData?.activity_count || 0,
        minutes: dayData?.total_duration_minutes || 0,
        hasData: !!dayData,
      });
    }
    
    return result;
  }, [data, days]);
  
  // Get intensity level (0-4)
  const getIntensity = (minutes: number): number => {
    if (minutes === 0) return 0;
    if (minutes < 30) return 1;
    if (minutes < 60) return 2;
    if (minutes < 90) return 3;
    return 4;
  };
  
  const intensityColors = [
    'bg-card-border', // 0 - no activity
    'bg-accent/20',   // 1 - light
    'bg-accent/40',   // 2 - moderate
    'bg-accent/60',   // 3 - high
    'bg-accent',      // 4 - intense
  ];
  
  // Split into weeks (7 days per row)
  const weeks = useMemo(() => {
    const result: typeof grid[] = [];
    for (let i = 0; i < grid.length; i += 7) {
      result.push(grid.slice(i, i + 7));
    }
    return result;
  }, [grid]);
  
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Consistency</CardTitle>
        <CardDescription>Last {days} days of workout activity</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Day labels */}
        <div className="flex mb-2">
          <div className="w-8" /> {/* Spacer for alignment */}
          <div className="flex gap-1 flex-1">
            {weekDays.map((day, i) => (
              <div key={i} className="flex-1 text-center text-xs text-gray-500">
                {day}
              </div>
            ))}
          </div>
        </div>
        
        {/* Grid */}
        <div className="space-y-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex items-center gap-1">
              {/* Week number or date */}
              <div className="w-8 text-xs text-gray-500 text-right pr-2">
                {weekIndex === 0 ? 'Wk' : ''}
              </div>
              
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={cn(
                    'flex-1 aspect-square rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-accent/50',
                    intensityColors[getIntensity(day.minutes)]
                  )}
                  title={`${day.date}: ${day.count} activities, ${day.minutes}m`}
                />
              ))}
              
              {/* Pad remaining days if week is incomplete */}
              {week.length < 7 &&
                Array(7 - week.length)
                  .fill(null)
                  .map((_, i) => (
                    <div key={`empty-${i}`} className="flex-1 aspect-square" />
                  ))}
            </div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-gray-500">
          <span>Less</span>
          {intensityColors.map((color, i) => (
            <div key={i} className={cn('w-3 h-3 rounded-sm', color)} />
          ))}
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}

