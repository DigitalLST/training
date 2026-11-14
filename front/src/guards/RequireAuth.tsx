import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function fetchMe(signal?: AbortSignal) {
  const token = getToken();
  if (!token) throw new Error('no_token');
  const r = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
    signal
  });
  if (!r.ok) throw new Error(`me_${r.status}`);
  return r.json();
}

export default function RequireAuth({
  section,
}: { section?: 'admin'|'moderator'|'superadmin' }) {
  const [status, setStatus] = React.useState<'loading'|'ok'|'ko'>('loading');
  const location = useLocation();

  React.useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const me = await fetchMe(ctrl.signal);
        if (section === 'admin' && !me?.isAdmin) throw new Error('forbidden');
        if (section === 'moderator' && !me?.isModerator) throw new Error('forbidden');
        if (section === 'superadmin' && !me?.isSuperAdmin) throw new Error('forbidden');
        setStatus('ok');
      } catch {
        setStatus('ko');
      }
    })();
    return () => ctrl.abort();
  }, [section]);

  if (status === 'loading') return null; // ou un spinner

  if (status === 'ko') {
    // ⛔️ on NE SUPPRIME PAS le token ici ; on redirige seulement
    return <Navigate to="/acceuil" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
