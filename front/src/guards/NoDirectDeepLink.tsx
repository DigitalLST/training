// src/guards/NoDirectDeepLink.tsx
import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';

type Props = {
  /** Les clés attendues dans location.state */
  requiredKeys: string[];
  /** Où rediriger si accès direct */
  redirectTo: string;
  /** Message optionnel (utile pour un toast) */
  message?: string;
  /** Clé de stockage (par défaut basée sur le pathname) */
  storageKey?: string;
  /** Durée de validité du state sauvegardé */
  ttlMs?: number;
};

/**
 * Bloque les deep-links: on exige des clés dans location.state *ou*
 * un state récent en sessionStorage. Sinon → redirect.
 */
export default function NoDirectDeepLink({
  requiredKeys,
  redirectTo,
  message,
  storageKey,
  ttlMs = 20 * 60 * 1000, // 20 min
}: Props) {
  const location = useLocation();
  const key = storageKey || `__ndl:${location.pathname}`;

  const state = (location.state || {}) as Record<string, unknown>;
  const hasAll = requiredKeys.every((k) => state[k] !== undefined);

  // 1) Si on a tout dans location.state → on persiste et on passe
  React.useEffect(() => {
    if (!hasAll) return;
    try {
      const payload = {
        t: Date.now(),
        state: requiredKeys.reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = state[k];
          return acc;
        }, {}),
      };
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  }, [hasAll, key, requiredKeys.join('|')]);

  if (hasAll) return <Outlet />;

  // 2) Sinon, on tente de restaurer depuis sessionStorage
  let validStored = false;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const j = JSON.parse(raw);
      const fresh = Date.now() - Number(j?.t || 0) <= ttlMs;
      const restored = j?.state || {};
      const ok = requiredKeys.every((k) => restored[k] !== undefined);
      validStored = fresh && ok;
    }
  } catch {
    validStored = false;
  }

  if (validStored) {
    // ✅ On laisse passer : les écrans lisent eux-mêmes sessionStorage en fallback
    return <Outlet />;
  }

  // 3) Accès direct → redirect
  return (
    <Navigate
      to={redirectTo}
      replace
      state={message ? { msg: message, from: location } : { from: location }}
    />
  );
}
