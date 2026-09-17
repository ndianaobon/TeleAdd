import { useEffect, useState } from 'react';
import { Plus, Send, RefreshCw, Unplug, ShieldCheck } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Avatar } from '../components/ui/Avatar';
import { AccountStatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingBlock, ErrorBlock } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { timeAgo } from '../lib/utils';
import type { TelegramAccount } from '../types';

type ConnectStep = 'phone' | 'code' | 'password' | 'done';

export function TelegramAccounts() {
  const [accounts, setAccounts] = useState<TelegramAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);
  const [step, setStep] = useState<ConnectStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [authId, setAuthId] = useState<string | null>(null);
  const [codeSentVia, setCodeSentVia] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const data = await api.get<TelegramAccount[]>('/telegram-accounts');
      setAccounts(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load Telegram accounts.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const closeConnect = () => {
    setConnectOpen(false);
    setStep('phone');
    setPhone('');
    setCode('');
    setPassword('');
    setAuthId(null);
    setCodeSentVia(null);
    setFormError(null);
    setResendNotice(null);
  };

  const sendCode = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ auth_id: string; code_sent_via: string }>('/telegram-accounts/auth/start', { phone_number: phone });
      setAuthId(res.auth_id);
      setCodeSentVia(res.code_sent_via);
      setStep('code');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to request a verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const resendCode = async () => {
    if (!authId) return;
    setFormError(null);
    setResendNotice(null);
    setResending(true);
    try {
      const res = await api.post<{ auth_id: string; code_sent_via: string }>('/telegram-accounts/auth/resend', { auth_id: authId });
      setCodeSentVia(res.code_sent_via);
      setCode(''); // the previous code's hash is now invalid — only the resent one will work
      setResendNotice(`Telegram resent the code via ${res.code_sent_via}.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to resend the code.');
    } finally {
      setResending(false);
    }
  };

  const verifyCode = async () => {
    if (!authId) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ status: string; account: TelegramAccount | null }>('/telegram-accounts/auth/code', { auth_id: authId, code });
      if (res.status === 'password_required') {
        setStep('password');
      } else {
        setStep('done');
        void load();
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to verify the code.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPassword = async () => {
    if (!authId) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post<{ status: string; account: TelegramAccount | null }>('/telegram-accounts/auth/password', { auth_id: authId, password });
      setStep('done');
      void load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to verify the password.');
    } finally {
      setSubmitting(false);
    }
  };

  const syncAccount = async (id: string) => {
    setSyncingId(id);
    try {
      const updated = await api.post<TelegramAccount>(`/telegram-accounts/${id}/sync`);
      setAccounts((prev) => prev?.map((a) => (a.id === id ? updated : a)) ?? prev);
    } catch {
      // surfaced via the account's own status badge on next load
    } finally {
      setSyncingId(null);
    }
  };

  const disconnectAccount = async () => {
    if (!disconnectId) return;
    setDisconnecting(true);
    try {
      await api.delete(`/telegram-accounts/${disconnectId}`);
      setAccounts((prev) => prev?.filter((a) => a.id !== disconnectId) ?? prev);
      setDisconnectId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to disconnect the account.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Telegram Accounts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Connect the Telegram accounts you own and administer. Sessions are encrypted at rest.</p>
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          <Plus className="h-4 w-4" /> Connect Another Account
        </Button>
      </div>

      {accounts === null && !loadError && <LoadingBlock label="Loading Telegram accounts…" />}
      {loadError && <ErrorBlock message={loadError} onRetry={load} />}

      {accounts && accounts.length === 0 && (
        <Card>
          <EmptyState icon={<Send className="h-6 w-6" />} title="No Telegram accounts connected" description="Connect a Telegram account to discover groups you administer and start managing members." action={<Button onClick={() => setConnectOpen(true)}>Connect Telegram</Button>} />
        </Card>
      )}

      {accounts && accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={a.first_name ?? '?'} lastName={a.last_name} seed={a.id} />
                    <div>
                      <p className="text-sm font-semibold">@{a.username ?? '—'}</p>
                      <p className="text-xs text-slate-500">
                        {a.first_name} {a.last_name}
                      </p>
                    </div>
                  </div>
                  <AccountStatusBadge status={a.status} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-400">Telegram ID</dt>
                    <dd className="font-mono text-slate-700 dark:text-slate-300">{a.telegram_user_id}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Last synchronised</dt>
                    <dd className="text-slate-700 dark:text-slate-300">{timeAgo(a.last_synced_at)}</dd>
                  </div>
                </dl>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" loading={syncingId === a.id} onClick={() => syncAccount(a.id)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Sync
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => setDisconnectId(a.id)}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={connectOpen}
        onClose={closeConnect}
        title="Connect Telegram account"
        description="You will authenticate directly with Telegram. We never store your verification code or 2FA password."
        footer={
          <>
            <Button variant="secondary" onClick={closeConnect}>
              Cancel
            </Button>
            {step === 'phone' && (
              <Button onClick={sendCode} loading={submitting} disabled={!phone.trim()}>
                Send code
              </Button>
            )}
            {step === 'code' && (
              <Button onClick={verifyCode} loading={submitting} disabled={!code.trim()}>
                Verify
              </Button>
            )}
            {step === 'password' && (
              <Button onClick={verifyPassword} loading={submitting} disabled={!password}>
                Sign in
              </Button>
            )}
            {step === 'done' && <Button onClick={closeConnect}>Done</Button>}
          </>
        }
      >
        <div className="space-y-3">
          {formError && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{formError}</p>}
          {step === 'phone' && <Input label="Phone number (international format)" placeholder="+1 555 000 0000" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} />}
          {step === 'code' && (
            <>
              <Input
                label="Verification code"
                placeholder="12345"
                hint={codeSentVia ? `Telegram sent a code via ${codeSentVia}.` : 'Enter the code Telegram sent to your device.'}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              {resendNotice && <p className="text-xs text-emerald-600 dark:text-emerald-400">{resendNotice}</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Didn't get it?{' '}
                <button type="button" onClick={resendCode} disabled={resending} className="font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300">
                  {resending ? 'Resending…' : 'Resend code'}
                </button>{' '}
                — this asks Telegram to try the next delivery method (e.g. SMS instead of the app).
              </p>
            </>
          )}
          {step === 'password' && (
            <Input label="Two-step verification password" type="password" hint="Required because your Telegram account has 2FA enabled." autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {step === 'done' && (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" /> Account connected. Your session is encrypted and stored securely.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={disconnectId !== null}
        onClose={() => setDisconnectId(null)}
        title="Disconnect Telegram account?"
        description="This will revoke the stored session. Existing migration history is kept. You can reconnect at any time."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisconnectId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={disconnectAccount} loading={disconnecting}>
              Disconnect
            </Button>
          </>
        }
      />
    </div>
  );
}
