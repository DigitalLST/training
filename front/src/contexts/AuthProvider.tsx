import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/api';
import { AuthCtx, type AuthState, type User } from './auth-context';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));
  const meSeq = useRef(0);

  const refreshMe = useCallback(async () => {
    const seq = ++meSeq.current;
    const me = await api('/auth/me');
    if (meSeq.current !== seq) return;
    setUser(me);
    localStorage.setItem('user', JSON.stringify(me));
  }, []);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try { await refreshMe(); }
      catch {
        if (cancelled) return;
        meSeq.current++;
        localStorage.removeItem('token'); localStorage.removeItem('user');
        setUser(null); setToken(null);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, refreshMe]);

  const setSession = useCallback((t: string, u: User) => {
    meSeq.current++;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u); setToken(t); setLoading(false);
  }, []);

  const login = useCallback<AuthState['login']>(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!data?.token || !data?.user) throw new Error('فشل إنشاء الجلسة');
    setSession(String(data.token), data.user);
    await refreshMe();
  }, [setSession, refreshMe]);

  const logout = useCallback(() => {
    meSeq.current++;
    setUser(null); setToken(null); setLoading(false);
    localStorage.removeItem('token'); localStorage.removeItem('user');
  }, []);

  const value = useMemo<AuthState>(() => ({ user, token, loading, login, logout, setSession, refreshMe }),
    [user, token, loading, login, logout, setSession, refreshMe]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
