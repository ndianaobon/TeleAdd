import { cn, initials } from '../../lib/utils';

const palette = [
  'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-200',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  lastName,
  size = 'md',
  className,
  seed,
}: {
  name: string;
  lastName?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  seed?: string;
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-xl',
  };
  const color = palette[hash(seed ?? name) % palette.length];
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', sizes[size], color, className)}>
      {initials(name, lastName)}
    </div>
  );
}
