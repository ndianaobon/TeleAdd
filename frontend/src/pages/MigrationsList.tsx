import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRightLeft } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MigrationStatusBadge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingBlock, ErrorBlock } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { formatNumber, pct, timeAgo } from '../lib/utils';
import type { Migration } from '../types';

export function MigrationsList() {
  const [migrations, setMigrations] = useState<Migration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      setMigrations(await api.get<Migration[]>('/migrations'));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load migrations.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Migrations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Active and recent member migration operations.</p>
        </div>
        <Link to="/migrations/new">
          <Button>
            <Plus className="h-4 w-4" /> New Migration
          </Button>
        </Link>
      </div>

      {migrations === null && !loadError && <LoadingBlock label="Loading migrations…" />}
      {loadError && <ErrorBlock message={loadError} onRetry={load} />}

      {migrations && migrations.length === 0 && (
        <Card>
          <EmptyState icon={<ArrowRightLeft className="h-6 w-6" />} title="No migrations yet" description="Create your first migration to move members between the communities you administer." action={<Link to="/migrations/new"><Button>New Migration</Button></Link>} />
        </Card>
      )}

      {migrations && migrations.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {migrations.map((m) => {
            const progress = pct(m.processed, m.total_selected);
            const href = m.status === 'running' || m.status === 'paused' || m.status === 'queued' ? `/migrations/${m.id}/progress` : `/migrations/${m.id}/results`;
            return (
              <Link key={m.id} to={href} className="card block p-5 transition-shadow hover:shadow-card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-slate-500">
                      {m.source_chat?.title ?? 'Unknown source'} → {m.destination_chat?.title ?? 'Unknown destination'}
                    </p>
                  </div>
                  <MigrationStatusBadge status={m.status} />
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>
                      {formatNumber(m.processed)} / {formatNumber(m.total_selected)} processed
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <ProgressBar value={progress} tone={m.status === 'failed' ? 'danger' : m.status === 'completed' ? 'success' : 'brand'} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(m.successful)}</p>
                    <p className="text-slate-400">Added</p>
                  </div>
                  <div>
                    <p className="font-semibold text-sky-600 dark:text-sky-400">{formatNumber(m.already_member)}</p>
                    <p className="text-slate-400">Existing</p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">{formatNumber(m.privacy_restricted)}</p>
                    <p className="text-slate-400">Restricted</p>
                  </div>
                  <div>
                    <p className="font-semibold text-red-600 dark:text-red-400">{formatNumber(m.failed)}</p>
                    <p className="text-slate-400">Failed</p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-slate-400">
                  via @{m.telegram_account.username ?? '—'} · {timeAgo(m.created_at)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
