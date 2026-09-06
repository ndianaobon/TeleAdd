import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Search, ShieldCheck, Star, AlertTriangle, Info, RefreshCw, X } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, EligibilityBadge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { LoadingBlock, ErrorBlock, Spinner } from '../../components/ui/Spinner';
import { api, ApiError } from '../../lib/api';
import { useWebSocket } from '../../lib/useWebSocket';
import type { MigrationReview, PaginatedMembers, TelegramChat, TelegramMember } from '../../types';
import { cn, formatNumber } from '../../lib/utils';

type SyncMessage = { type: 'started' } | { type: 'progress'; loaded: number } | { type: 'completed'; total: number } | { type: 'failed'; error: string };

const steps = ['Source', 'Destination', 'Members', 'Review'] as const;

type Filter = 'all' | 'eligible' | 'restricted' | 'already_member' | 'admins' | 'bots' | 'deleted';
const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'restricted', label: 'Restricted' },
  { key: 'already_member', label: 'Already member' },
  { key: 'admins', label: 'Admins' },
  { key: 'bots', label: 'Bots' },
  { key: 'deleted', label: 'Deleted' },
];

const lastSeenLabel: Record<TelegramMember['last_seen_bucket'], string> = {
  online: 'Online',
  recently: 'Recently',
  within_week: 'Within a week',
  within_month: 'Within a month',
  long_ago: 'Long ago',
  hidden: 'Hidden',
};

const PAGE_SIZE = 25;

export function MigrationWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState<string | null>(params.get('source'));
  const [destId, setDestId] = useState<string | null>(params.get('destination'));

  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [chatsError, setChatsError] = useState<string | null>(null);

  const [membersPage, setMembersPage] = useState<PaginatedMembers | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rules, setRules] = useState({ excludeBots: true, excludeAdmins: true, excludeDeleted: true, excludeExisting: true, requireUsername: false });
  const [detail, setDetail] = useState<TelegramMember | null>(null);
  const [page, setPage] = useState(1);

  const [review, setReview] = useState<MigrationReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TelegramChat[]>('/groups')
      .then(setChats)
      .catch((err) => setChatsError(err instanceof ApiError ? err.message : 'Failed to load groups.'));
  }, []);

  const source = chats?.find((c) => c.id === sourceId) ?? null;
  const dest = chats?.find((c) => c.id === destId) ?? null;

  // Backend requires both chats to belong to the same connected Telegram account.
  const destinationCandidates = useMemo(() => (chats ?? []).filter((c) => !source || c.telegram_account_id === source.telegram_account_id), [chats, source]);

  const loadMembers = () => {
    if (!source) return;
    setMembersLoading(true);
    setMembersError(null);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), filter });
    if (query.trim()) qs.set('q', query.trim());
    if (dest) qs.set('destination_chat_id', dest.id);
    api
      .get<PaginatedMembers>(`/groups/${source.id}/members?${qs.toString()}`)
      .then(setMembersPage)
      .catch((err) => setMembersError(err instanceof ApiError ? err.message : 'Failed to load members.'))
      .finally(() => setMembersLoading(false));
  };

  useEffect(() => {
    if (step === 2) loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, source?.id, dest?.id, page, filter, query]);

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncLoaded, setSyncLoaded] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  const startMemberSync = async () => {
    if (!source) return;
    setSyncError(null);
    setSyncLoaded(0);
    setSyncState('syncing'); // connect the socket before triggering the task so no early progress frames are missed
    try {
      await api.post(`/groups/${source.id}/members/sync`);
    } catch (err) {
      setSyncError(err instanceof ApiError ? err.message : 'Failed to start member sync.');
      setSyncState('error');
    }
  };

  const onSyncMessage = (msg: SyncMessage) => {
    if (msg.type === 'started') {
      setSyncState('syncing');
    } else if (msg.type === 'progress') {
      setSyncLoaded(msg.loaded);
    } else if (msg.type === 'completed') {
      setSyncState('done');
      loadMembers();
    } else if (msg.type === 'failed') {
      setSyncState('error');
      setSyncError('Telegram sync failed: ' + msg.error);
    }
  };

  useWebSocket<SyncMessage>(step === 2 && source && syncState === 'syncing' ? `/ws/groups/${source.id}/sync` : null, onSyncMessage);

  useEffect(() => {
    setPage(1);
  }, [filter, query, source?.id]);

  const pageItems = membersPage?.items ?? [];
  const applyRules = (m: TelegramMember) => {
    if (rules.excludeBots && m.is_bot) return false;
    if (rules.excludeAdmins && m.is_admin) return false;
    if (rules.excludeDeleted && m.is_deleted) return false;
    if (rules.excludeExisting && m.eligibility === 'already_member') return false;
    if (rules.requireUsername && !m.username) return false;
    return true;
  };
  const visiblePageItems = pageItems.filter(applyRules);
  const pageAllSelected = visiblePageItems.length > 0 && visiblePageItems.every((m) => selected.has(m.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const togglePage = () =>
    setSelected((s) => {
      const n = new Set(s);
      visiblePageItems.forEach((m) => (pageAllSelected ? n.delete(m.id) : n.add(m.id)));
      return n;
    });
  const clear = () => setSelected(new Set());

  const [selectingAll, setSelectingAll] = useState(false);
  const selectAll = async () => {
    if (!source) return;
    setSelectingAll(true);
    try {
      const qs = new URLSearchParams({ filter });
      if (query.trim()) qs.set('q', query.trim());
      if (dest) qs.set('destination_chat_id', dest.id);
      const ids = await api.get<string[]>(`/groups/${source.id}/members/ids?${qs.toString()}`);
      setSelected(new Set(ids));
    } catch (err) {
      setMembersError(err instanceof ApiError ? err.message : 'Failed to select all matching members.');
    } finally {
      setSelectingAll(false);
    }
  };

  const canContinue = [!!source, !!dest && dest.id !== source?.id && dest.can_invite_users, selected.size > 0, true][step];

  useEffect(() => {
    if (step !== 3 || !source || !dest || selected.size === 0) return;
    setReviewError(null);
    setReview(null);
    api
      .post<MigrationReview>('/migrations/review', {
        telegram_account_id: source.telegram_account_id,
        source_chat_id: source.id,
        destination_chat_id: dest.id,
        member_ids: Array.from(selected),
        config: { rules: { exclude_bots: rules.excludeBots, exclude_admins: rules.excludeAdmins, exclude_deleted: rules.excludeDeleted, exclude_existing_destination_members: rules.excludeExisting, require_username: rules.requireUsername } },
      })
      .then(setReview)
      .catch((err) => setReviewError(err instanceof ApiError ? err.message : 'Failed to review this operation.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const startOperation = async () => {
    if (!source || !dest) return;
    setStarting(true);
    setStartError(null);
    try {
      const migration = await api.post<{ id: string }>('/migrations', {
        telegram_account_id: source.telegram_account_id,
        source_chat_id: source.id,
        destination_chat_id: dest.id,
        member_ids: Array.from(selected),
        config: { rules: { exclude_bots: rules.excludeBots, exclude_admins: rules.excludeAdmins, exclude_deleted: rules.excludeDeleted, exclude_existing_destination_members: rules.excludeExisting, require_username: rules.requireUsername } },
      });
      await api.post(`/migrations/${migration.id}/start`);
      navigate(`/migrations/${migration.id}/progress`);
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : 'Failed to start the operation.');
    } finally {
      setStarting(false);
    }
  };

  const GroupPicker = ({ value, onChange, requireInvite, list }: { value: string | null; onChange: (id: string) => void; requireInvite?: boolean; list: TelegramChat[] }) => {
    const [q, setQ] = useState('');
    const filteredList = list.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
    const renderCard = (c: TelegramChat) => {
      const disabled = requireInvite ? !c.can_invite_users || c.id === sourceId : false;
      return (
        <button
          key={c.id}
          disabled={disabled}
          onClick={() => onChange(c.id)}
          className={cn(
            'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === c.id ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
          )}
        >
          <Avatar name={c.title} seed={c.id} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {c.title}
              {c.is_favorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
            </p>
            <p className="text-xs text-slate-500">{formatNumber(c.member_count)} members</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.is_admin && (
                <Badge tone="success">
                  <ShieldCheck className="h-3 w-3" /> Admin
                </Badge>
              )}
              {requireInvite && (c.can_invite_users ? <Badge tone="success">Can invite</Badge> : <Badge tone="danger">Cannot invite</Badge>)}
              {c.id === sourceId && requireInvite && <Badge tone="neutral">Source group</Badge>}
            </div>
          </div>
          {value === c.id && <Check className="h-4 w-4 text-brand-500" />}
        </button>
      );
    };
    return (
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filteredList.length === 0 ? (
          <p className="text-sm text-slate-500">{requireInvite ? 'No other groups from this Telegram account can receive invitations.' : 'No groups found.'}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredList.map(renderCard)}</div>
        )}
      </div>
    );
  };

  if (chatsError) return <ErrorBlock message={chatsError} />;
  if (chats === null) return <LoadingBlock label="Loading your groups…" />;

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors',
                i === step ? 'bg-brand-500 text-white' : i < step ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
              )}
            >
              <span className="tabular-nums">0{i + 1}</span> {s}
            </button>
            {i < steps.length - 1 && <span className="h-px w-6 bg-slate-200 dark:bg-slate-800" />}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-400 dark:bg-slate-800">05 Results</span>
        </li>
      </ol>

      {step === 0 && (
        <Card>
          <CardBody className="space-y-5">
            <div>
              <h1 className="text-lg font-semibold">Choose your source group</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Select the Telegram community whose members you want to work with.</p>
            </div>
            <GroupPicker value={sourceId} onChange={setSourceId} list={chats} />
          </CardBody>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardBody className="space-y-5">
            <div>
              <h1 className="text-lg font-semibold">Choose your destination group</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Select the group where the selected members should be invited, subject to Telegram's permissions and restrictions.</p>
            </div>
            <GroupPicker value={destId} onChange={setDestId} requireInvite list={destinationCandidates} />
          </CardBody>
        </Card>
      )}

      {step === 2 && source && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={source.title} seed={source.id} size="sm" />
                  <div>
                    <p className="text-sm font-semibold">Source: {source.title}</p>
                    <p className="text-xs text-slate-500">
                      {source.members_synced_at ? `${formatNumber(source.member_count)} members loaded · ready for batch selection` : 'Members have not been synced from Telegram yet'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {syncState === 'syncing' && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Spinner className="h-3.5 w-3.5" /> Syncing… {formatNumber(syncLoaded)} loaded
                    </span>
                  )}
                  <Button variant="secondary" size="sm" loading={syncState === 'syncing'} onClick={startMemberSync}>
                    <RefreshCw className="h-3.5 w-3.5" /> Sync members from Telegram
                  </Button>
                </div>
              </CardBody>
              {syncError && (
                <CardBody className="pt-0">
                  <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{syncError}</p>
                </CardBody>
              )}
              <CardBody className="flex flex-wrap gap-1 pt-0">
                {filters.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', filter === f.key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}>
                    {f.label}
                  </button>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className="input pl-9" placeholder="Search name, username, or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-brand-600 dark:text-brand-300">{formatNumber(selected.size)} members selected</span>
                    <Button variant="ghost" size="sm" loading={selectingAll} onClick={selectAll}>
                      Select all ({formatNumber(membersPage?.total ?? 0)})
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clear} disabled={selected.size === 0}>
                      Clear
                    </Button>
                  </div>
                </div>

                {membersError && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{membersError}</p>}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="w-8 pb-2">
                          <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select page" className="rounded border-slate-300" />
                        </th>
                        <th className="pb-2 font-medium">Member</th>
                        <th className="pb-2 font-medium">Username</th>
                        <th className="pb-2 font-medium">Telegram ID</th>
                        <th className="pb-2 font-medium">Last seen</th>
                        <th className="pb-2 font-medium">Eligibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {membersLoading && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center">
                            <Spinner className="mx-auto h-5 w-5" />
                          </td>
                        </tr>
                      )}
                      {!membersLoading &&
                        visiblePageItems.map((m) => (
                          <tr key={m.id} className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50', selected.has(m.id) && 'bg-brand-50/50 dark:bg-brand-500/5')} onClick={() => setDetail(m)}>
                            <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${m.first_name}`} className="rounded border-slate-300" />
                            </td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={m.first_name ?? '?'} lastName={m.last_name} seed={m.id} size="sm" />
                                <span className="font-medium">
                                  {m.first_name} {m.last_name}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 text-slate-600 dark:text-slate-300">{m.username ? `@${m.username}` : <span className="text-slate-400">—</span>}</td>
                            <td className="py-2.5 font-mono text-xs text-slate-500">{m.telegram_user_id}</td>
                            <td className="py-2.5 text-xs text-slate-500">{lastSeenLabel[m.last_seen_bucket]}</td>
                            <td className="py-2.5">
                              <EligibilityBadge eligibility={m.eligibility} />
                            </td>
                          </tr>
                        ))}
                      {!membersLoading && visiblePageItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                            No members match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Page {page} of {Math.max(1, Math.ceil((membersPage?.total ?? 0) / PAGE_SIZE))} · {formatNumber(membersPage?.total ?? 0)} total
                  </span>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="secondary" size="sm" disabled={page * PAGE_SIZE >= (membersPage?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-3">
                <h3 className="text-sm font-semibold">Selection rules</h3>
                {(
                  [
                    ['excludeBots', 'Exclude bots'],
                    ['excludeAdmins', 'Exclude admins'],
                    ['excludeDeleted', 'Exclude deleted accounts'],
                    ['excludeExisting', 'Exclude existing destination members'],
                    ['requireUsername', 'Only members with usernames'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{label}</span>
                    <input type="checkbox" checked={rules[key]} onChange={(e) => setRules((r) => ({ ...r, [key]: e.target.checked }))} className="rounded border-slate-300" />
                  </label>
                ))}
                <p className="text-[11px] text-slate-400">These rules are re-applied when the operation starts, so a superset selection is safe.</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-3">
                <h3 className="text-sm font-semibold">Migration configuration</h3>
                <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
                  <p className="text-[11px] text-brand-700 dark:text-brand-200">Selected members</p>
                  <p className="text-2xl font-semibold text-brand-700 dark:text-brand-200">{formatNumber(selected.size)}</p>
                </div>
                {dest && (
                  <div>
                    <p className="label">Destination</p>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                      <Avatar name={dest.title} seed={dest.id} size="sm" />
                      <div>
                        <p className="text-sm font-medium">{dest.title}</p>
                        <p className="text-xs text-slate-500">{formatNumber(dest.member_count)} existing members</p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-500">A full eligibility breakdown is shown on the Review step.</p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {step === 3 && source && dest && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardBody className="space-y-6">
              <div>
                <h1 className="text-lg font-semibold">Review operation</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Confirm the details below before starting.</p>
              </div>

              {reviewError && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{reviewError}</p>}
              {startError && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{startError}</p>}

              {!review && !reviewError && <LoadingBlock label="Reviewing selection…" />}

              {review && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    ['Source', source.title],
                    ['Destination', dest.title],
                    ['Selected members', formatNumber(review.selected)],
                    ['Known eligible', formatNumber(review.known_eligible)],
                    ['Potentially restricted', formatNumber(review.potentially_restricted)],
                    ['Already in destination', formatNumber(review.already_in_destination)],
                    ['Excluded by rules', formatNumber(review.excluded_by_rules)],
                    ['Estimated processing', 'Depends on Telegram response / rate limits'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <p className="text-[11px] text-slate-400">{k}</p>
                      <p className="mt-0.5 text-sm font-medium">{v}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>
                  Telegram controls whether individual users can be invited. Privacy settings, permissions, flood limits and other restrictions may prevent some invitations. The application will accurately report the result of every attempted operation and will pause when Telegram requires it.
                </p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3 text-sm">
              <h3 className="font-semibold">Safety settings</h3>
              <div className="flex gap-2 text-xs text-slate-500">
                <Info className="h-4 w-4 shrink-0" />
                Invitations are sent one at a time with a cooldown between each. Flood-wait responses from Telegram automatically pause the operation for the required duration.
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Cooldown between invites</dt>
                  <dd className="font-medium">8 seconds</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Skip channel admins</dt>
                  <dd className="font-medium">{rules.excludeAdmins ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Auto-pause on flood wait</dt>
                  <dd className="font-medium">Always</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? navigate('/migrations') : setStep((s) => s - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button variant="success" loading={starting} disabled={!review} onClick={startOperation}>
            Start Operation
          </Button>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDetail(null)} />
          <aside className="relative h-full w-full max-w-sm overflow-y-auto border-l border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-surface-dark">
            <button onClick={() => setDetail(null)} className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center text-center">
              <Avatar name={detail.first_name ?? '?'} lastName={detail.last_name} seed={detail.id} size="xl" />
              <h2 className="mt-3 text-base font-semibold">
                {detail.first_name} {detail.last_name}
              </h2>
              <p className="text-sm text-slate-500">{detail.username ? `@${detail.username}` : 'No username'}</p>
              <div className="mt-2">
                <EligibilityBadge eligibility={detail.eligibility} />
              </div>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              {[
                ['Telegram ID', String(detail.telegram_user_id)],
                ['Account type', detail.is_bot ? 'Bot' : detail.is_premium ? 'Premium user' : 'User'],
                ['Last seen', lastSeenLabel[detail.last_seen_bucket]],
                ['Group role', detail.is_admin ? 'Administrator' : 'Member'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <Button className="mt-6 w-full" variant={selected.has(detail.id) ? 'secondary' : 'primary'} onClick={() => toggle(detail.id)}>
              {selected.has(detail.id) ? 'Deselect member' : 'Select member'}
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
