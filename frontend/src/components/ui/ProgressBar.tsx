import { cn } from '../../lib/utils';

export function ProgressBar({
  value,
  className,
  tone = 'brand',
  size = 'md',
}: {
  value: number;
  className?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'slate';
  size?: 'sm' | 'md' | 'lg';
}) {
  const colors = {
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    slate: 'bg-slate-400',
  };
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800', heights[size], className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', colors[tone])} style={{ width: `${clamped}%` }} />
    </div>
  );
}
