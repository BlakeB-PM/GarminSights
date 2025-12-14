import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type WeeksMode = 4 | 8 | 12 | 16 | 24 | 52;
type DaysMode = 7 | 14 | 30 | 60 | 90;

interface TimeFrameSelectorProps {
  mode: 'weeks' | 'days';
  value: WeeksMode | DaysMode;
  onChange: (value: WeeksMode | DaysMode) => void;
  className?: string;
}

const WEEKS_OPTIONS: WeeksMode[] = [4, 8, 12, 16, 24, 52];
const DAYS_OPTIONS: DaysMode[] = [7, 14, 30, 60, 90];

export function TimeFrameSelector({ mode, value, onChange, className }: TimeFrameSelectorProps) {
  const options = mode === 'weeks' ? WEEKS_OPTIONS : DAYS_OPTIONS;

  const formatLabel = (val: number): string => {
    if (mode === 'weeks') {
      if (val === 52) return '1 year';
      if (val === 24) return '6 months';
      return `${val} weeks`;
    } else {
      if (val === 90) return '3 months';
      return `${val} days`;
    }
  };

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <span className="text-sm text-gray-400">Time frame:</span>
      {options.map((option) => (
        <Button
          key={option}
          variant={value === option ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onChange(option)}
        >
          {formatLabel(option)}
        </Button>
      ))}
    </div>
  );
}

