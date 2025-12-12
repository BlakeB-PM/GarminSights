import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown, X } from 'lucide-react';

interface MultiSelectProps {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function MultiSelect({ label, options, selected, onChange, min = 0, max = 10, className }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      if (selected.length > (min || 0)) {
        onChange(selected.filter(item => item !== option));
      }
    } else {
      if (selected.length < max) {
        onChange([...selected, option]);
      }
    }
  };

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-400 mb-1">
          {label} {selected.length > 0 && `(${selected.length} selected)`}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full bg-card border border-card-border rounded-lg px-4 py-2 pr-10 text-left',
          'focus:outline-none focus:border-accent transition-colors cursor-pointer',
          'flex items-center justify-between'
        )}
      >
        <span className={cn('text-gray-100', selected.length === 0 && 'text-gray-500')}>
          {selected.length === 0 ? 'Select muscle groups...' : selected.join(', ')}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-card-border rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map((option) => {
            const isSelected = selected.includes(option);
            const isDisabled = !isSelected && selected.length >= max;
            
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleOption(option)}
                disabled={isDisabled}
                className={cn(
                  'w-full px-4 py-2 text-left hover:bg-card-border transition-colors',
                  'flex items-center justify-between',
                  isSelected && 'bg-accent/20',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="text-gray-100">{option}</span>
                {isSelected && (
                  <X 
                    className="w-4 h-4 text-gray-400 hover:text-gray-200" 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(option);
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

