import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Play, XCircle, Radio } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Avatar } from '../../components/ui/Avatar';
import { ResultBadge } from '../../components/ui/Badge';
import { mockEvents, mockMigrations } from '../../mock/data';
import { formatNumber, formatTime, pct } from '../../lib/utils';

export function MigrationProgress() {
  const { id } = useParams();
  const navigate = useNavigate();
  const migration = mockMigrations.find((m) => m.id === id) ?? mockMigrations[1];
  const [paused, setPaused] = useState(migration.status === 'paused');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cooldown, setCooldown] = useState(8);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 8 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [paused]);

  const progress = pct(migration.processed, migration.total_selected);
  const remaining = migration.total_selected - migration.processed;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Operation in progress: {migration.name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {migration.source_chat.title} → {migration.destination_chat.title}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-50 p-5 dark:bg-brand-500/10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-4xl font-semibold text-brand-700 dark:text-brand-200">{progress}%</span>
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">
                  {formatNumber(migration.processed)} / {formatNumber(migration.total_selected)} processed
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{paused ? 'Paused — no invitations are being sent' : 'Estimated remaining depends on Telegram rate limits'}</p>
            </div>
            <ProgressBar value={progress} size="lg" className="mt-4" tone={paused ? 'warning' : 'brand'} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Successful', value: migration.successful, cls: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Already members', value: migration.already_member, cls: 'text-sky-600 dark:text-sky-400' },
              { label: 'Restricted', value: migration.privacy_restricted, cls: 'text-amber-600 dark:text-amber-400' },
              { label: 'Failed', value: migration.failed, cls: 'text-red-600 dark:text-red-400' },
              { label: 'Remaining', value: remaining, cls: '' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-400">{s.label}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${s.cls}`}>{formatNumber(s.value)}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Avatar name="Current" seed="cur" size="sm" />
              <div>
                <p className="text-xs text-slate-400">Current operation</p>
                <p className="font-medium">@{mockEvents[0].username}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Cooldown</p>
              <p className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{paused ? '—' : `${cooldown} seconds`}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live migration event log</h2>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> Live feed stream
            </span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {mockEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Avatar name={e.username ?? '?'} seed={e.id} size="xs" />
                <span className="font-medium">@{e.username}</span>
                {e.result && <ResultBadge result={e.result} />}
                <span className="truncate text-xs text-slate-500">{e.message}</span>
                <span className="ml-auto font-mono text-[11px] text-slate-400">{formatTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this operation?"
        description="Members already invited will remain in the destination group. Remaining members will not be processed. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep running
            </Button>
            <Button variant="danger" onClick={() => navigate(`/migrations/${migration.id}/results`)}>
              Cancel operation
            </Button>
          </>
        }
      />
    </div>
  );
}
