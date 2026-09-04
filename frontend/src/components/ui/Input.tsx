import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leading, trailing, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className={className}>
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          {leading && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leading}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn('input', leading && 'pl-9', trailing && 'pr-9', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20')}
            {...props}
          />
          {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{trailing}</span>}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
