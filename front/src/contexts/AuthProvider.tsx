import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/api';
import { AuthCtx, type AuthState, type User } from './auth-context';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const meSeq = useRef(0); // invalide les réponses /auth/me obsolètes

  // Restaure depuis localStorage
  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t) {
      setToken(t);
      if (u) { try { setUser(JSON.parse(u)); } catch {} }
    } else {
      setLoading(false);
    }
  }, []);

  // /auth/me (race-safe via meSeq)
  const refreshMe = useCallback(async () => {
    const seq = ++meSeq.current;
    const me = await api('/auth/me');     // cache: 'no-store' côté api.ts
    if (meSeq.current !== seq) return;    // une requête plus récente a gagné
    setUser(me);
    localStorage.setItem('user', JSON.stringify(me));
  }, []);

  // Dès qu'on a un token (au montage OU après login), on rafraîchit
  useEffect(() => {
    if (!token) return;
    (async () => {
      try { await refreshMe(); }
      catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, refreshMe]);

  const setSession = useCallback((t: string, u: User) => {
    meSeq.current++; // invalide toute réponse /auth/me précédente
    setToken(t);
    setUser(u);
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, []);

  const login = useCallback<AuthState['login']>(async (email, password) => {
    setUser(null); // évite d'afficher l'ancien user pendant la transition
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSession(String(data.token || ''), data.user);
    await refreshMe(); // récupère le /auth/me du nouveau token immédiatement
  }, [setSession, refreshMe]);

  const logout = useCallback(() => {
    meSeq.current++; // invalide toute /auth/me en vol
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  const value: AuthState = useMemo(() => ({
    user, token, loading, login, logout, setSession, refreshMe
  }), [user, token, loading, login, logout, setSession, refreshMe]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
