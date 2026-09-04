import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">If an account exists for <strong>{email}</strong>, a reset link has been sent.</p>
        <Link to="/login" className="text-xs text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="Work Email" name="email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Button type="submit" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <p className="text-center text-xs text-slate-500">
        <Link to="/login" className="text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
