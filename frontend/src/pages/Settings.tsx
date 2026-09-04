import { useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const tabs = ['Account', 'API Configuration', 'Preferences', 'Privacy & Data'] as const;

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Account');
  const [showHash, setShowHash] = useState(false);
  const [cooldown, setCooldown] = useState(8);
  const [prefs, setPrefs] = useState({ skipAdmins: true, autoCooldown: true, emailReport: false });
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings & Configuration</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure your profile, Telegram API credentials, and safety preferences.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-brand-500 text-brand-600 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Account' && (
        <Card className="max-w-2xl">
          <CardBody className="space-y-5">
            <h2 className="text-sm font-semibold">Account profile</h2>
            <div className="flex items-center gap-4">
              <Avatar name={user?.full_name ?? 'U'} size="xl" />
              <div className="flex gap-2">
                <Button size="sm">Upload new</Button>
                <Button size="sm" variant="secondary">
                  Remove
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Full name" defaultValue={user?.full_name} />
              <Input label="Email address" type="email" defaultValue={user?.email} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Current password" type="password" autoComplete="current-password" />
              <Input label="New password" type="password" autoComplete="new-password" />
            </div>
            <div className="flex justify-end">
              <Button>Save changes</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'API Configuration' && (
        <Card className="max-w-2xl">
          <CardBody className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Telegram API credentials</h2>
              <p className="text-xs text-slate-500">Create an application at my.telegram.org to obtain these. They are stored encrypted and never logged.</p>
            </div>
            <Input label="Telegram API ID (App ID)" placeholder="12345678" inputMode="numeric" />
            <Input label="Telegram API Hash (Secret)" type={showHash ? 'text' : 'password'} placeholder="••••••••••••••••••••••••" trailing={<button type="button" onClick={() => setShowHash((s) => !s)} aria-label="Toggle visibility">{showHash ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
            <div>
              <div className="mb-1.5 flex justify-between">
                <span className="label mb-0">Cooldown between invitations</span>
                <span className="text-xs font-medium text-brand-600 dark:text-brand-300">{cooldown} seconds / invite</span>
              </div>
              <input type="range" min={3} max={60} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="w-full accent-brand-500" />
              <p className="mt-1 text-xs text-slate-500">Longer cooldowns reduce the chance of Telegram flood-wait responses. Flood waits are always respected regardless of this setting.</p>
            </div>
            <div className="flex justify-end">
              <Button>Save credentials</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'Preferences' && (
        <Card className="max-w-2xl">
          <CardBody className="space-y-5">
            <h2 className="text-sm font-semibold">Safety preferences</h2>
            <Toggle checked={prefs.skipAdmins} onChange={(v) => setPrefs((p) => ({ ...p, skipAdmins: v }))} label="Skip channel admins" hint="Ignore administrators of the destination group by default." />
            <Toggle checked={prefs.autoCooldown} onChange={(v) => setPrefs((p) => ({ ...p, autoCooldown: v }))} label="Auto-cooldown interval" hint="Automatically extend cooldown after repeated rejections." />
            <Toggle checked={prefs.emailReport} onChange={(v) => setPrefs((p) => ({ ...p, emailReport: v }))} label="Email execution report" hint="Send a CSV summary when each operation finishes." />
          </CardBody>
        </Card>
      )}

      {tab === 'Privacy & Data' && (
        <Card className="max-w-2xl">
          <CardBody className="space-y-5">
            <h2 className="text-sm font-semibold">Your data</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">We store only what is needed to run your operations: your account, connected Telegram sessions (encrypted), discovered groups, member identifiers, and operation results. Phone numbers are never collected.</p>
            <div className="space-y-2">
              <Button variant="secondary" className="w-full justify-start">
                Delete all migration data
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                Disconnect all Telegram accounts
              </Button>
              <Button variant="danger" className="w-full justify-start" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete my account and all data
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account?"
        description="This permanently removes your account, connected Telegram sessions, and all operation history. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(false)}>
              Delete permanently
            </Button>
          </>
        }
      >
        <Input label="Type DELETE to confirm" placeholder="DELETE" />
      </Modal>
    </div>
  );
}
