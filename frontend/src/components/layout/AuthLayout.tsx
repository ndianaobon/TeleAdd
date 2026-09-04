import { Navigate, Outlet } from 'react-router-dom';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function AuthLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-base font-semibold">Telegram Member Migrator</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Manage and migrate your Telegram communities with confidence.</p>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
