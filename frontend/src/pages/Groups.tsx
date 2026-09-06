import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, ShieldCheck, ChevronRight, Users, RefreshCw } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingBlock, ErrorBlock } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { cn, formatNumber, timeAgo } from '../lib/utils';
import type { TelegramAccount, TelegramChat } from '../types';

export function Groups() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [chatData, accountData] = await Promise.all([api.get<TelegramChat[]>('/groups'), api.get<TelegramAccount[]>('/telegram-accounts')]);
      setChats(chatData);
      setAccounts(accountData);
      setSelectedId((prev) => prev ?? chatData[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load groups.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sync = async () => {
    const accountId = accounts[0]?.id;
    if (!accountId) return;
    setSyncing(true);
    try {
      const data = await api.post<TelegramChat[]>(`/groups/sync?account_id=${accountId}`);
      setChats(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to sync groups from Telegram.');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const list = chats ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.title.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q));
  }, [chats, query]);

  const selected = (chats ?? []).find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Discovered Communities</h2>
            <Button variant="ghost" size="sm" loading={syncing} disabled={accounts.length === 0} onClick={sync}>
              <RefreshCw className="h-3.5 w-3.5" /> Sync
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Filter by name, type, or size" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {chats === null && !loadError && <LoadingBlock label="Loading groups…" />}
          {loadError && <ErrorBlock message={loadError} onRetry={load} />}
          {chats && chats.length === 0 && (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No groups discovered yet"
              description="Connect a Telegram account, then sync to discover the groups and channels it administers."
              action={
                <Button size="sm" onClick={() => navigate('/accounts')}>
                  Connect Telegram
                </Button>
              }
            />
          )}

          {chats && chats.length > 0 && (
            <ul className="space-y-1.5">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      c.id === selectedId
                        ? 'border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-500/10'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    )}
                  >
                    <Avatar name={c.title} seed={c.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {c.title}
                        {c.is_favorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatNumber(c.member_count)} members · {c.chat_type === 'channel' ? 'Channel' : 'Group'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="lg:col-span-3">
        {selected ? (
          <CardBody className="space-y-6">
            <div className="flex items-start gap-4">
              <Avatar name={selected.title} seed={selected.id} size="xl" />
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{selected.chat_type === 'channel' ? 'Telegram Channel' : 'Telegram Group'}</Badge>
                  {selected.username && <Badge>@{selected.username}</Badge>}
                  {selected.is_admin ? (
                    <Badge tone="success">
                      <ShieldCheck className="h-3 w-3" /> Administrator
                    </Badge>
                  ) : (
                    <Badge tone="warning">Member only</Badge>
                  )}
                  {selected.can_invite_users ? <Badge tone="success">Can invite users</Badge> : <Badge tone="danger">Cannot invite users</Badge>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-400">Total members</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(selected.member_count)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-400">Telegram ID</p>
                <p className="mt-1 truncate font-mono text-sm">{selected.telegram_chat_id}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-400">Last synchronised</p>
                <p className="mt-1 text-sm">{timeAgo(selected.last_synced_at)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
              <Button onClick={() => navigate(`/migrations/new?source=${selected.id}`)}>
                <Users className="h-4 w-4" /> Use as Source Group
              </Button>
              <Button variant="secondary" disabled={!selected.can_invite_users} onClick={() => navigate(`/migrations/new?destination=${selected.id}`)}>
                Use as Destination Group
              </Button>
            </div>
          </CardBody>
        ) : (
          <CardBody>{chats === null ? 'Loading…' : 'Select a community to see details.'}</CardBody>
        )}
      </Card>
    </div>
  );
}
