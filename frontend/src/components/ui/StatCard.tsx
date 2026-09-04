import type { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export function StatCard({
  label,
  value,
  caption,
  captionTone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  captionTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    danger: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
  };
  return (
    <div className={cn('card flex items-start justify-between p-5', className)}>
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        {caption && <span className={cn('mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium', tones[captionTone])}>{caption}</span>}
      </div>
      <div className="text-brand-400">{icon ?? <TrendingUp className="h-5 w-5" />}</div>
    </div>
  );
}
