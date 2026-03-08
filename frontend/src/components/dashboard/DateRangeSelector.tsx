import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { cn, formatDate } from '../../lib/utils';

type Preset = 'today' | 'week' | 'month' | 'lastWeek' | 'lastMonth' | 'custom';

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
}

export function DateRangeSelector({ startDate, endDate, onDateChange }: DateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [activePreset, setActivePreset] = useState<Preset>('week');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd;
  };

  const setPreset = (preset: Exclude<Preset, 'custom'>) => {
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
      case 'lastWeek': {
        const lastWeekStart = getWeekStart(new Date(today));
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        start = lastWeekStart;
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        break;
      }
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      default:
        return;
    }

    setActivePreset(preset);
    setShowCustom(false);
    onDateChange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
    );
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const delta = direction === 'prev' ? -1 : 1;

    if (activePreset === 'today') {
      const d = new Date(startDate);
      d.setDate(d.getDate() + delta);
      const s = d.toISOString().split('T')[0];
      onDateChange(s, s);
    } else if (activePreset === 'week' || activePreset === 'lastWeek') {
      const newStart = new Date(startDate);
      newStart.setDate(newStart.getDate() + delta * 7);
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + 6);
      const ns = newStart.toISOString().split('T')[0];
      const ne = newEnd.toISOString().split('T')[0];
      // Update preset: if moved to current week → 'week', else 'lastWeek' or custom
      const currentWeekStart = getWeekStart(today).toISOString().split('T')[0];
      setActivePreset(ns === currentWeekStart ? 'week' : 'lastWeek');
      onDateChange(ns, ne);
    } else if (activePreset === 'month' || activePreset === 'lastMonth') {
      const ref = new Date(startDate);
      ref.setMonth(ref.getMonth() + delta);
      const newStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const isCurrentMonth =
        newStart.getFullYear() === today.getFullYear() && newStart.getMonth() === today.getMonth();
      const newEnd = isCurrentMonth
        ? new Date(today)
        : new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      setActivePreset(isCurrentMonth ? 'month' : 'lastMonth');
      onDateChange(newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0]);
    } else {
      // Custom: shift by the range duration
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      start.setDate(start.getDate() + delta * days);
      end.setDate(end.getDate() + delta * days);
      onDateChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
    }
  };

  const presets: Array<{ key: Exclude<Preset, 'custom'>; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'lastWeek', label: 'Last Week' },
    { key: 'lastMonth', label: 'Last Month' },
  ];

  return (
    <Card className="mb-6">
      <div className="p-4 space-y-3">
        {/* Header row: label + arrows */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            <span className="text-base font-semibold text-white">
              {formatDate(startDate)}
              {startDate !== endDate && ` – ${formatDate(endDate)}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigatePeriod('prev')}
              className="p-1.5"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigatePeriod('next')}
              className="p-1.5"
              disabled={endDate >= todayStr}
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Preset pills */}
        <div className="flex flex-wrap gap-2">
          {presets.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium transition-colors',
                activePreset === key
                  ? 'bg-accent text-white'
                  : 'bg-card-border text-gray-400 hover:bg-accent/20 hover:text-accent',
              )}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              setActivePreset('custom');
              setShowCustom(!showCustom);
            }}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium transition-colors',
              activePreset === 'custom'
                ? 'bg-accent text-white'
                : 'bg-card-border text-gray-400 hover:bg-accent/20 hover:text-accent',
            )}
          >
            Custom
          </button>
        </div>

        {/* Custom date inputs */}
        {showCustom && (
          <div className="grid grid-cols-2 gap-4 pt-1">
            <Input
              type="date"
              label="Start Date"
              value={startDate}
              onChange={(e) => {
                setActivePreset('custom');
                onDateChange(e.target.value, endDate);
              }}
              max={endDate}
            />
            <Input
              type="date"
              label="End Date"
              value={endDate}
              onChange={(e) => {
                setActivePreset('custom');
                onDateChange(startDate, e.target.value);
              }}
              min={startDate}
              max={todayStr}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
