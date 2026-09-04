import { Users, Send, Activity, AlertTriangle, Database, Server, Cpu } from 'lucide-react';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const services = [
  { name: 'API', status: 'healthy', latency: '42 ms', icon: Server },
  { name: 'Worker', status: 'healthy', latency: '3 active', icon: Cpu },
  { name: 'Redis', status: 'healthy', latency: '1 ms', icon: Activity },
  { name: 'PostgreSQL', status: 'healthy', latency: '6 ms', icon: Database },
] as const;

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Platform administration</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">System-wide health and usage. Telegram session secrets are never exposed here.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value="—" caption="Connect backend" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Connected Telegram accounts" value="—" icon={<Send className="h-5 w-5" />} />
        <StatCard label="Operations (30d)" value="—" icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Failed operations (30d)" value="—" captionTone="danger" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>
      <Card>
        <CardHeader title="Service health" subtitle="Live status from /health endpoints" />
        <CardBody className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {services.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <s.icon className="h-5 w-5 text-brand-500" />
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.latency}</p>
                </div>
              </div>
              <Badge tone="success" dot>
                Healthy
              </Badge>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
