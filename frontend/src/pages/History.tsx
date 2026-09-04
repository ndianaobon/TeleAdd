import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MigrationStatusBadge } from '../components/ui/Badge';
import { mockMigrations } from '../mock/data';
import type { MigrationStatus } from '../types';
import { formatDate, formatNumber } from '../lib/utils';

export function History() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<MigrationStatus | 'all'>('all');

  const rows = useMemo(
    () =>
      mockMigrations.filter((m) => {
        if (status !== 'all' && m.status !== status) return false;
        const s = q.toLowerCase();
        return !s || m.name.toLowerCase().includes(s) || m.source_chat.title.toLowerCase().includes(s) || m.destination_chat.title.toLowerCase().includes(s);
      }),
    [q, status],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Migration History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Every operation with Telegram's recorded outcome.</p>
        </div>
        <Button variant="secondary">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Destination</th>
                  <th className="pb-2 text-right font-medium">Selected</th>
                  <th className="pb-2 text-right font-medium">Successful</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 text-slate-500">{formatDate(m.created_at)}</td>
                    <td className="py-3">
                      <Link to={`/migrations/${m.id}/results`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">
                        {m.source_chat.title}
                      </Link>
                    </td>
                    <td className="py-3">{m.destination_chat.title}</td>
                    <td className="py-3 text-right tabular-nums">{formatNumber(m.total_selected)}</td>
                    <td className="py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(m.successful)}</td>
                    <td className="py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatNumber(m.failed + m.privacy_restricted)}</td>
                    <td className="py-3">
                      <MigrationStatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No operations match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
