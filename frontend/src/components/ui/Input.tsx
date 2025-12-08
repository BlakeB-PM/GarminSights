import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="block text-sm font-medium text-gray-400 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full bg-card border border-card-border rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500',
            'focus:outline-none focus:border-accent transition-colors',
            error && 'border-danger focus:border-danger',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

