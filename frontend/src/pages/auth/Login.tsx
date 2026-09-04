import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/api';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail ?? err.message) : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="Work Email" name="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Password
          </label>
          <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline dark:text-brand-300">
            Forgot password?
          </Link>
        </div>
        <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        OR
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={() => navigate('/signup')}>
        <Send className="h-4 w-4 text-brand-500" />
        Create an account
      </Button>
    </form>
  );
}
