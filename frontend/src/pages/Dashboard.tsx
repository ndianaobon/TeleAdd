import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Send, History, Activity, CheckCircle2, XCircle, ArrowRightLeft } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MigrationStatusBadge } from '../components/ui/Badge';
import { LoadingBlock, ErrorBlock } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { formatDate, formatNumber, timeAgo } from '../lib/utils';
import type { Migration, TelegramAccount } from '../types';

const eventText = (m: Migration): string => {
  switch (m.status) {
    case 'completed':
      return `Completed migration of ${formatNumber(m.successful)} members from ${m.source_chat?.title ?? 'source'}`;
    case 'paused':
      return `Paused migration to ${m.destination_chat?.title ?? 'destination'}`;
    case 'running':
    case 'queued':
      return `Migration to ${m.destination_chat?.title ?? 'destination'} is in progress`;
    case 'failed':
      return `Migration to ${m.destination_chat?.title ?? 'destination'} failed`;
    default:
      return `Migration "${m.name}" created`;
  }
};

export function Dashboard() {
  const [accounts, setAccounts] = useState<TelegramAccount[] | null>(null);
  const [migrations, setMigrations] = useState<Migration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [accountData, migrationData] = await Promise.all([api.get<TelegramAccount[]>('/telegram-accounts'), api.get<Migration[]>('/migrations?limit=20')]);
      setAccounts(accountData);
      setMigrations(migrationData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load dashboard data.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <ErrorBlock message={loadError} onRetry={load} />;
  if (accounts === null || migrations === null) return <LoadingBlock label="Loading dashboard…" />;

  const active = migrations.filter((m) => m.status === 'running' || m.status === 'paused' || m.status === 'queued').length;
  const completed = migrations.filter((m) => m.status === 'completed').length;
  const processed = migrations.reduce((s, m) => s + m.processed, 0);
  const successful = migrations.reduce((s, m) => s + m.successful, 0);
  const failed = migrations.reduce((s, m) => s + m.failed, 0);
  const recent = migrations.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected Accounts" value={accounts.length} caption={`${accounts.filter((a) => a.status === 'connected').length} active`} captionTone="success" icon={<Send className="h-5 w-5" />} />
        <StatCard label="Active Operations" value={active} caption="Processing now" captionTone="warning" icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Completed Operations" value={completed} caption={`${formatNumber(processed)} members processed`} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Successful Invitations" value={formatNumber(successful)} caption={`${formatNumber(failed)} failed / skipped`} captionTone="danger" icon={<XCircle className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent Operations"
            action={
              <Link to="/history" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="overflow-x-auto pt-4">
            {migrations.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No migrations yet.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-3 font-medium">Source → Destination</th>
                    <th className="pb-3 font-medium">Members</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {migrations.map((m) => (
                    <tr key={m.id} className="group">
                      <td className="py-3">
                        <Link to={m.status === 'running' || m.status === 'paused' || m.status === 'queued' ? `/migrations/${m.id}/progress` : `/migrations/${m.id}/results`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">
                          {m.source_chat?.title ?? 'Unknown'} <span className="text-slate-400">→</span> {m.destination_chat?.title ?? 'Unknown'}
                        </Link>
                      </td>
                      <td className="py-3 tabular-nums text-slate-600 dark:text-slate-300">
                        {formatNumber(m.successful)}/{formatNumber(m.total_selected)}
                      </td>
                      <td className="py-3">
                        <MigrationStatusBadge status={m.status} />
                      </td>
                      <td className="py-3 text-slate-500">{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <div className="rounded-2xl bg-brand-500 p-5 text-white shadow-card">
            <h3 className="text-sm font-semibold">Start New Migration</h3>
            <p className="mt-1 text-xs text-brand-100">Select a source group, filter its members, and invite them into your destination community — subject to Telegram's permissions and rate limits.</p>
            <Link to="/migrations/new" className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-brand-700 shadow-sm transition-colors hover:bg-brand-50">
              <ArrowRightLeft className="h-4 w-4" /> Configure Migration
            </Link>
          </div>

          <Card>
            <CardHeader title="Quick Actions" />
            <CardBody className="grid grid-cols-1 gap-2 pt-3">
              <Link to="/accounts">
                <Button variant="secondary" className="w-full justify-start">
                  <Send className="h-4 w-4 text-brand-500" /> Connect Telegram
                </Button>
              </Link>
              <Link to="/groups">
                <Button variant="secondary" className="w-full justify-start">
                  <Users className="h-4 w-4 text-brand-500" /> Browse Groups
                </Button>
              </Link>
              <Link to="/history">
                <Button variant="secondary" className="w-full justify-start">
                  <History className="h-4 w-4 text-brand-500" /> View History
                </Button>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent Events" />
            <CardBody className="space-y-3 pt-3">
              {recent.length === 0 ? (
                <p className="text-xs text-slate-500">No activity yet.</p>
              ) : (
                recent.map((m) => (
                  <div key={m.id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">{eventText(m)}</p>
                      <p className="text-[10px] text-slate-400">{timeAgo(m.finished_at ?? m.started_at ?? m.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
