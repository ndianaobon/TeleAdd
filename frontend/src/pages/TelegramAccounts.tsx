import { useState } from 'react';
import { Plus, Send, RefreshCw, Unplug, ShieldCheck } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Avatar } from '../components/ui/Avatar';
import { AccountStatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { mockAccounts } from '../mock/data';
import { timeAgo } from '../lib/utils';

type ConnectStep = 'phone' | 'code' | 'password' | 'done';

export function TelegramAccounts() {
  const [connectOpen, setConnectOpen] = useState(false);
  const [step, setStep] = useState<ConnectStep>('phone');
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  const closeConnect = () => {
    setConnectOpen(false);
    setStep('phone');
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

      {mockAccounts.length === 0 ? (
        <Card>
          <EmptyState icon={<Send className="h-6 w-6" />} title="No Telegram accounts connected" description="Connect a Telegram account to discover groups you administer and start managing members." action={<Button onClick={() => setConnectOpen(true)}>Connect Telegram</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mockAccounts.map((a) => (
            <Card key={a.id}>
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={a.first_name} lastName={a.last_name} seed={a.id} />
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
                  <Button variant="secondary" size="sm" className="flex-1">
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
            {step === 'phone' && <Button onClick={() => setStep('code')}>Send code</Button>}
            {step === 'code' && <Button onClick={() => setStep('password')}>Verify</Button>}
            {step === 'password' && <Button onClick={() => setStep('done')}>Sign in</Button>}
            {step === 'done' && <Button onClick={closeConnect}>Done</Button>}
          </>
        }
      >
        {step === 'phone' && <Input label="Phone number (international format)" placeholder="+1 555 000 0000" autoFocus />}
        {step === 'code' && <Input label="Verification code" placeholder="12345" hint="Enter the code Telegram sent to your device." autoFocus />}
        {step === 'password' && <Input label="Two-step verification password" type="password" hint="Required only if your Telegram account has 2FA enabled." autoFocus />}
        {step === 'done' && (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" /> Account connected. Your session is encrypted and stored securely.
          </div>
        )}
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
            <Button variant="danger" onClick={() => setDisconnectId(null)}>
              Disconnect
            </Button>
          </>
        }
      />
    </div>
  );
}
