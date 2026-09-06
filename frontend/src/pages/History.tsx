import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { MigrationStatusBadge } from '../components/ui/Badge';
import { LoadingBlock, ErrorBlock } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import type { Migration, MigrationStatus } from '../types';
import { formatDate, formatNumber } from '../lib/utils';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export function History() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<MigrationStatus | 'all'>('all');
  const [rows, setRows] = useState<Migration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      setRows(await api.get<Migration[]>(`/migrations?${params.toString()}`));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load migration history.');
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Migration History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Every operation with Telegram's recorded outcome.</p>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search operations" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as MigrationStatus | 'all')}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="running">In progress</option>
              <option value="paused">Paused</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {rows === null && !loadError && <LoadingBlock label="Loading history…" />}
          {loadError && <ErrorBlock message={loadError} onRetry={load} />}

          {rows && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Destination</th>
                    <th className="pb-2 text-right font-medium">Selected</th>
                    <th className="pb-2 text-right font-medium">Successful</th>
                    <th className="pb-2 text-right font-medium">Failed</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 text-slate-500">{formatDate(m.created_at)}</td>
                      <td className="py-3">
                        <Link to={`/migrations/${m.id}/results`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">
                          {m.source_chat?.title ?? 'Unknown'}
                        </Link>
                      </td>
                      <td className="py-3">{m.destination_chat?.title ?? 'Unknown'}</td>
                      <td className="py-3 text-right tabular-nums">{formatNumber(m.total_selected)}</td>
                      <td className="py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(m.successful)}</td>
                      <td className="py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatNumber(m.failed + m.privacy_restricted)}</td>
                      <td className="py-3">
                        <MigrationStatusBadge status={m.status} />
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`${API_BASE}/migrations/${m.id}/export.csv`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                          title="Export CSV"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        No operations match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
