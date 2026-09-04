import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/api';

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(email, password, fullName);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail ?? err.message) : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="Full Name" name="full_name" autoComplete="name" placeholder="Alex Rivera" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      <Input label="Work Email" name="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Password" name="password" type="password" autoComplete="new-password" placeholder="At least 10 characters" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        Create account
      </Button>
      <p className="text-center text-xs text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-600 hover:underline dark:text-brand-300">
          Sign in
        </Link>
      </p>
    </form>
  );
}
