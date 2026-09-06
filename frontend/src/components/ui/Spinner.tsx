import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-sm text-slate-500 dark:text-slate-400">
      <Spinner className="h-5 w-5" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
          Try again
        </button>
      )}
    </div>
  );
}
