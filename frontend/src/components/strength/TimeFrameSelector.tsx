import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type WeeksMode = 4 | 8 | 12 | 16 | 24 | 52;
type DaysMode = 7 | 14 | 30 | 60 | 90;
type PresetDaysMode = 7 | 30 | 90 | 180 | 365;

type SelectorMode = 'weeks' | 'days' | 'presetDays';
type SelectorValue = WeeksMode | DaysMode | PresetDaysMode;

interface TimeFrameSelectorProps {
  mode: SelectorMode;
  value: SelectorValue;
  onChange: (value: SelectorValue) => void;
  className?: string;
}

const WEEKS_OPTIONS: WeeksMode[] = [4, 8, 12, 16, 24, 52];
const DAYS_OPTIONS: DaysMode[] = [7, 14, 30, 60, 90];
const PRESET_DAYS_OPTIONS: PresetDaysMode[] = [7, 30, 90, 180, 365];

export function TimeFrameSelector({ mode, value, onChange, className }: TimeFrameSelectorProps) {
  const options: readonly number[] =
    mode === 'weeks' ? WEEKS_OPTIONS :
    mode === 'days' ? DAYS_OPTIONS :
    PRESET_DAYS_OPTIONS;

  const formatLabel = (val: number): string => {
    if (mode === 'weeks') {
      if (val === 52) return '1 year';
      if (val === 24) return '6 months';
      return `${val} weeks`;
    }
    if (mode === 'presetDays') {
      if (val === 7) return '1 week';
      if (val === 30) return '1 month';
      if (val === 90) return '3 months';
      if (val === 180) return '6 months';
      if (val === 365) return '1 year';
      return `${val} days`;
    }
    if (val === 90) return '3 months';
    return `${val} days`;
  };

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <span className="text-sm text-gray-400">Time frame:</span>
      {options.map((option) => (
        <Button
          key={option}
          variant={value === option ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onChange(option as SelectorValue)}
        >
          {formatLabel(option)}
        </Button>
      ))}
    </div>
  );
}
