import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { MemberEligibility, MigrationMemberResult, MigrationStatus, TelegramAccountStatus } from '../../types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const migrationStatusMeta: Record<MigrationStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'info' },
  running: { label: 'In Progress', tone: 'warning' },
  paused: { label: 'Paused', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function MigrationStatusBadge({ status }: { status: MigrationStatus }) {
  const m = migrationStatusMeta[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const eligibilityMeta: Record<MemberEligibility, { label: string; tone: Tone }> = {
  eligible: { label: 'Eligible', tone: 'success' },
  restricted: { label: 'Restricted', tone: 'warning' },
  already_member: { label: 'Already member', tone: 'info' },
  admin: { label: 'Admin', tone: 'brand' },
  bot: { label: 'Bot', tone: 'neutral' },
  deleted: { label: 'Deleted', tone: 'danger' },
};

export function EligibilityBadge({ eligibility }: { eligibility: MemberEligibility }) {
  const m = eligibilityMeta[eligibility];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const resultMeta: Record<MigrationMemberResult, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  success: { label: 'Success', tone: 'success' },
  already_member: { label: 'Already Member', tone: 'info' },
  privacy_restricted: { label: 'Privacy Restricted', tone: 'warning' },
  permission_denied: { label: 'Permission Denied', tone: 'danger' },
  flood_wait: { label: 'Flood Wait', tone: 'warning' },
  invalid_user: { label: 'Invalid User', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export function ResultBadge({ result }: { result: MigrationMemberResult }) {
  const m = resultMeta[result];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const accountStatusMeta: Record<TelegramAccountStatus, { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'success' },
  disconnected: { label: 'Disconnected', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  restricted: { label: 'Restricted', tone: 'danger' },
};

export function AccountStatusBadge({ status }: { status: TelegramAccountStatus }) {
  const m = accountStatusMeta[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}
