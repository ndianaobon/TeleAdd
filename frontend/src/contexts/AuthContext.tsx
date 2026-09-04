import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { api, ApiError } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Phase 1 UI prototype only: lets the dashboard render without the backend running.
const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true';
const mockUser: User = {
  id: 'mock-user',
  email: 'alex.rivera@example.com',
  full_name: 'Alex Rivera',
  role: 'admin',
  is_verified: true,
  created_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(MOCK_AUTH ? mockUser : null);
  const [loading, setLoading] = useState(!MOCK_AUTH);

  const refresh = useCallback(async () => {
    if (MOCK_AUTH) return;
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    if (MOCK_AUTH) {
      setUser(mockUser);
      return;
    }
    await api.post('/auth/login', { email, password });
    await refresh();
  };

  const signup = async (email: string, password: string, full_name: string) => {
    if (MOCK_AUTH) {
      setUser({ ...mockUser, email, full_name });
      return;
    }
    await api.post('/auth/register', { email, password, full_name });
    await login(email, password);
  };

  const logout = async () => {
    if (!MOCK_AUTH) await api.post('/auth/logout', {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
