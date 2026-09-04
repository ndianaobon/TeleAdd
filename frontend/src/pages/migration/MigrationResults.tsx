import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Plus, XCircle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { Avatar } from '../../components/ui/Avatar';
import { ResultBadge } from '../../components/ui/Badge';
import { mockMembers, mockMigrations } from '../../mock/data';
import type { MigrationMemberResult } from '../../types';
import { formatDate, formatNumber, formatTime, pct } from '../../lib/utils';

const reasons: Record<MigrationMemberResult, string | null> = {
  pending: null,
  success: null,
  already_member: 'User is already a member of the destination',
  privacy_restricted: 'User privacy settings block invitations',
  permission_denied: 'Connected account lacks permission to invite',
  flood_wait: 'Telegram flood wait triggered; operation paused',
  invalid_user: 'The Telegram user is no longer available',
  failed: 'Telegram returned an error for this user',
  skipped: 'Skipped by selection rules',
};

export function MigrationResults() {
  const { id } = useParams();
  const m = mockMigrations.find((x) => x.id === id) ?? mockMigrations[0];
  const skipped = m.total_selected - m.successful - m.already_member - m.privacy_restricted - m.failed;

  const resultCycle: MigrationMemberResult[] = ['success', 'success', 'already_member', 'privacy_restricted', 'failed', 'success', 'invalid_user', 'success'];
  const rows = mockMembers.slice(0, 12).map((mem, i) => ({ mem, result: resultCycle[i % resultCycle.length] }));

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${m.status === 'failed' ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'}`}>
        <div className="flex items-center gap-3">
          {m.status === 'failed' ? <XCircle className="h-6 w-6 text-red-500" /> : <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
          <div>
            <p className="text-sm font-semibold">
              Migration '{m.name}' {m.status === 'failed' ? 'stopped' : 'completed'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Finished on {formatDate(m.finished_at)} at {formatTime(m.finished_at)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Download className="h-3.5 w-3.5" /> Export CSV Report
          </Button>
          <Link to="/migrations/new">
            <Button variant="success" size="sm">
              <Plus className="h-3.5 w-3.5" /> New Operation
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Selected" value={formatNumber(m.total_selected)} caption="100% processed" />
        <StatCard label="Successfully Added" value={formatNumber(m.successful)} caption={`${pct(m.successful, m.total_selected)}% success rate`} captionTone="success" />
        <StatCard label="Already Members" value={formatNumber(m.already_member)} caption={`${pct(m.already_member, m.total_selected)}%`} captionTone="brand" />
        <StatCard label="Privacy Restricted" value={formatNumber(m.privacy_restricted)} caption={`${pct(m.privacy_restricted, m.total_selected)}% restricted`} captionTone="warning" />
        <StatCard label="Failed / Skipped" value={formatNumber(m.failed + Math.max(skipped, 0))} caption={`${pct(m.failed, m.total_selected)}% failure`} captionTone="danger" />
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold">Detailed execution log</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2 font-medium">Target member</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Telegram response</th>
                  <th className="pb-2 text-right font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map(({ mem, result }, i) => (
                  <tr key={mem.id}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={mem.first_name} lastName={mem.last_name} seed={mem.id} size="sm" />
                        <div>
                          <p className="font-medium">{mem.username ? `@${mem.username}` : `${mem.first_name} ${mem.last_name}`}</p>
                          <p className="text-xs text-slate-400">
                            {mem.first_name} {mem.last_name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <ResultBadge result={result} />
                    </td>
                    <td className="py-2.5 text-xs text-slate-500">{reasons[result] ?? '—'}</td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-slate-400">{formatTime(new Date(new Date(m.started_at ?? m.created_at).getTime() + i * 9000).toISOString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
