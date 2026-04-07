'use client';

import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react';
import { User, getMe } from '@/lib/api';

interface AuthContext {
  user: User | null;
  token: string | null;
  loading: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthContext>({
  user: null, token: null, loading: true,
  setAuth: () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('pm_token');
    if (stored) {
      setToken(stored);
      getMe()
        .then(u => setUser(u))
        .catch(() => { localStorage.removeItem('pm_token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const setAuth = useCallback((t: string, u: User) => {
    localStorage.setItem('pm_token', t);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pm_token');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthCtx.Provider value={{ user, token, loading, setAuth, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
