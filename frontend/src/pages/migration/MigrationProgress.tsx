import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Play, XCircle, Radio } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Avatar } from '../../components/ui/Avatar';
import { ResultBadge } from '../../components/ui/Badge';
import { LoadingBlock, ErrorBlock } from '../../components/ui/Spinner';
import { api, ApiError } from '../../lib/api';
import { useWebSocket } from '../../lib/useWebSocket';
import { formatNumber, formatTime, pct } from '../../lib/utils';
import type { Migration, MigrationEvent, MigrationStatus } from '../../types';

type Counters = Pick<Migration, 'total_selected' | 'processed' | 'successful' | 'already_member' | 'privacy_restricted' | 'failed'>;

type WsMessage =
  | { type: 'snapshot'; status: MigrationStatus; counters: Counters; last_error: string | null }
  | { type: 'status_change'; status: MigrationStatus; message: string | null; counters: Counters }
  | { type: 'processing'; telegram_user_id: number; username: string | null }
  | { type: 'member_result'; telegram_user_id: number; username: string | null; display_name: string | null; result: MigrationEvent['result']; message: string; telegram_error: string | null; counters: Counters }
  | { type: 'flood_wait'; seconds: number; resume_at: string; message: string };

let eventSeq = 0;

export function MigrationProgress() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [migration, setMigration] = useState<Migration | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [events, setEvents] = useState<MigrationEvent[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const m = await api.get<Migration>(`/migrations/${id}`);
      setMigration(m);
      setStatus(m.status);
      setCounters(m);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load this migration.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'snapshot' || msg.type === 'status_change') {
      setStatus(msg.status);
      setCounters(msg.counters);
    } else if (msg.type === 'processing') {
      setCurrentUsername(msg.username);
    } else if (msg.type === 'member_result') {
      setCounters(msg.counters);
      setCurrentUsername(msg.username);
      const event: MigrationEvent = { id: `evt-${eventSeq++}`, migration_id: id ?? '', type: 'member_result', result: msg.result, username: msg.username, message: msg.message, created_at: new Date().toISOString() };
      setEvents((prev) => [event, ...prev].slice(0, 50));
    } else if (msg.type === 'flood_wait') {
      const event: MigrationEvent = { id: `evt-${eventSeq++}`, migration_id: id ?? '', type: 'flood_wait', username: null, message: msg.message, created_at: new Date().toISOString() };
      setEvents((prev) => [event, ...prev].slice(0, 50));
    }
  }, [id]);

  useWebSocket<WsMessage>(id ? `/ws/migrations/${id}` : null, onMessage);

  const isTerminal = status === 'completed' || status === 'cancelled' || status === 'failed';
  useEffect(() => {
    if (isTerminal && id) navigate(`/migrations/${id}/results`, { replace: true });
  }, [isTerminal, id, navigate]);

  const runAction = async (action: 'pause' | 'start' | 'cancel') => {
    if (!id) return;
    setActionPending(true);
    try {
      const m = await api.post<Migration>(`/migrations/${id}/${action}`);
      setMigration(m);
      setStatus(m.status);
      setCounters(m);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : `Failed to ${action} the operation.`);
    } finally {
      setActionPending(false);
      setCancelOpen(false);
    }
  };

  if (loadError && !migration) return <ErrorBlock message={loadError} onRetry={load} />;
  if (!migration || !counters || !status) return <LoadingBlock label="Loading operation…" />;

  const progress = pct(counters.processed, counters.total_selected);
  const remaining = counters.total_selected - counters.processed;
  const paused = status === 'paused';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Operation in progress: {migration.name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {migration.source_chat?.title ?? 'Unknown'} → {migration.destination_chat?.title ?? 'Unknown'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" loading={actionPending} onClick={() => runAction(paused ? 'start' : 'pause')}>
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </div>

          {loadError && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{loadError}</p>}

          <div className="rounded-2xl bg-brand-50 p-5 dark:bg-brand-500/10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-4xl font-semibold text-brand-700 dark:text-brand-200">{progress}%</span>
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">
                  {formatNumber(counters.processed)} / {formatNumber(counters.total_selected)} processed
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{paused ? 'Paused — no invitations are being sent' : 'Estimated remaining depends on Telegram rate limits'}</p>
            </div>
            <ProgressBar value={progress} size="lg" className="mt-4" tone={paused ? 'warning' : 'brand'} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Successful', value: counters.successful, cls: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Already members', value: counters.already_member, cls: 'text-sky-600 dark:text-sky-400' },
              { label: 'Restricted', value: counters.privacy_restricted, cls: 'text-amber-600 dark:text-amber-400' },
              { label: 'Failed', value: counters.failed, cls: 'text-red-600 dark:text-red-400' },
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
                <p className="font-medium">{currentUsername ? `@${currentUsername}` : '—'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Cooldown between invites</p>
              <p className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{migration.config.cooldown_seconds ?? 8} seconds</p>
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
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Waiting for the first result…</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Avatar name={e.username ?? '?'} seed={e.id} size="xs" />
                  <span className="font-medium">{e.username ? `@${e.username}` : 'Flood wait'}</span>
                  {e.result && <ResultBadge result={e.result} />}
                  <span className="truncate text-xs text-slate-500">{e.message}</span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">{formatTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
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
            <Button variant="danger" loading={actionPending} onClick={() => runAction('cancel')}>
              Cancel operation
            </Button>
          </>
        }
      />
    </div>
  );
}
