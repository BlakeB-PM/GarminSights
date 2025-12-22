import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { formatDate } from '../../lib/utils';

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
}

export function DateRangeSelector({ startDate, endDate, onDateChange }: DateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd;
  };

  const setPreset = (preset: 'today' | 'week' | 'month' | 'lastWeek' | 'lastMonth') => {
    let start: Date;
    let end: Date = new Date(today);

    switch (preset) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'week':
        start = getWeekStart(new Date(today));
        end = getWeekEnd(new Date(today));
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'lastWeek':
        const lastWeekStart = getWeekStart(new Date(today));
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        start = lastWeekStart;
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
    }

    onDateChange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );
    setShowCustom(false);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const currentStart = new Date(startDate);
    const daysDiff = direction === 'prev' ? -7 : 7;
    const newStart = new Date(currentStart);
    newStart.setDate(newStart.getDate() + daysDiff);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + 6);
    
    onDateChange(
      newStart.toISOString().split('T')[0],
      newEnd.toISOString().split('T')[0]
    );
  };

  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold">Date Range</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateWeek('prev')}
              className="p-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateWeek('next')}
              className="p-1"
              disabled={endDate >= todayStr}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset('today')}
            className={startDate === endDate && startDate === todayStr ? 'bg-accent/20' : ''}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset('week')}
          >
            This Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset('month')}
          >
            This Month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset('lastWeek')}
          >
            Last Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreset('lastMonth')}
          >
            Last Month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustom(!showCustom)}
          >
            Custom
          </Button>
        </div>

        {showCustom && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Input
              type="date"
              label="Start Date"
              value={startDate}
              onChange={(e) => onDateChange(e.target.value, endDate)}
              max={endDate}
            />
            <Input
              type="date"
              label="End Date"
              value={endDate}
              onChange={(e) => onDateChange(startDate, e.target.value)}
              min={startDate}
              max={todayStr}
            />
          </div>
        )}

        <div className="mt-4 text-sm text-gray-400">
          <span>
            {formatDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })} -{' '}
            {formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
    </Card>
  );
}

