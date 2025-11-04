import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

/**
 * Bloque l’accès si certaines clés sont absentes de location.state.
 * Optionnel: va aussi regarder dans sessionStorage (objets JSON) si tu fournis storageKeys.
 */
export default function RequireNavState({
  requiredKeys,
  redirectTo,
  message,
  storageKeys, // ex: ['detail_ctx','aff_ctx']
}: {
  requiredKeys: string[];
  redirectTo: string;
  message?: string;
  storageKeys?: string[]; 
}) {
  const location = useLocation();

  const ok = React.useMemo(() => {
    const hasAll = (src: any) =>
      src && requiredKeys.every(k => src[k] !== undefined && src[k] !== null && String(src[k]) !== '');

    if (hasAll(location.state)) return true;

    if (storageKeys?.length) {
      for (const sk of storageKeys) {
        try {
          const obj = JSON.parse(sessionStorage.getItem(sk) || 'null');
          if (hasAll(obj)) return true;
        } catch {}
      }
    }
    return false;
  }, [location.state, requiredKeys.join('|'), storageKeys?.join('|')]);

  if (!ok) {
    // On ne touche pas au token ; on informe/redirige juste
    return <Navigate to={redirectTo} replace state={message ? { msg: message } : undefined} />;
  }

  return <Outlet />;
}
