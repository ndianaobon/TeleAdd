import { Link } from 'react-router-dom';
import { ArrowRight, Users, Send, History, Activity, CheckCircle2, XCircle, ArrowRightLeft } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MigrationStatusBadge } from '../components/ui/Badge';
import { mockAccounts, mockMigrations } from '../mock/data';
import { formatDate, formatNumber, timeAgo } from '../lib/utils';

export function Dashboard() {
  const active = mockMigrations.filter((m) => m.status === 'running' || m.status === 'paused' || m.status === 'queued').length;
  const completed = mockMigrations.filter((m) => m.status === 'completed').length;
  const processed = mockMigrations.reduce((s, m) => s + m.processed, 0);
  const successful = mockMigrations.reduce((s, m) => s + m.successful, 0);
  const failed = mockMigrations.reduce((s, m) => s + m.failed, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected Accounts" value={mockAccounts.length} caption={`${mockAccounts.filter((a) => a.status === 'connected').length} active`} captionTone="success" icon={<Send className="h-5 w-5" />} />
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
                {mockMigrations.map((m) => (
                  <tr key={m.id} className="group">
                    <td className="py-3">
                      <Link to={m.status === 'running' ? `/migrations/${m.id}/progress` : `/migrations/${m.id}/results`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">
                        {m.source_chat.title} <span className="text-slate-400">→</span> {m.destination_chat.title}
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
              {[
                { text: `Completed migration of ${formatNumber(mockMigrations[0].successful)} members from ${mockMigrations[0].source_chat.title}`, at: mockMigrations[0].finished_at },
                { text: 'Discovered group Telegram News Feed (8.2k members)', at: mockMigrations[2].created_at },
                { text: 'Paused migration to Marketing Masters by administrator request', at: mockMigrations[1].started_at },
                { text: 'Telegram account @alex_migrator synchronised', at: mockAccounts[0].last_synced_at },
              ].map((e, i) => (
                <div key={i} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{e.text}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(e.at)}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
