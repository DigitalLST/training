// src/components/ProtectedSection.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth.ts';

const asBool = (v: unknown) =>
  v === true || v === 'true' || v === 1 || v === '1';

export default function ProtectedSection({
  section,
  children,
}: {
  section: 'moderator' | 'admin' | 'superadmin';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // ✅ Si un token existe mais que le contexte n’a pas encore remonté `user`,
  // on *attend* au lieu de rediriger (sinon le back déclenche un faux "logout").
  const token =
    (typeof window !== 'undefined' && (localStorage.getItem('token') || sessionStorage.getItem('token'))) ||
    null;
  const hydrating = loading || (!!token && !user);

  if (hydrating) {
    // tu peux mettre un vrai spinner ici
    return <div style={{ padding: 8 }}>Chargement…</div>;
  }

  // ⛔️ Pas de token et pas d’utilisateur => on redirige vers l’accueil public
  if (!user) {
    return <Navigate to="/acceuil" replace state={{ from: location }} />;
  }

  const isMod = asBool((user as any).isModerator);
  const isAdm = asBool((user as any).isAdmin);
  const isSupAdm = asBool((user as any).isSuperAdmin);

  const canAccess =
    (
      {
        superadmin: isSupAdm,                 // réservé superadmin
        moderator: isMod || isSupAdm,         // superadmin passe
        admin: isAdm || isMod || isSupAdm,    // admin/mod/superadmin
      } as Record<string, boolean>
    )[section] ?? isSupAdm;

  // En cas d’accès refusé (mauvais rôle), on redirige aussi avec replace
  return canAccess ? <>{children}</> : <Navigate to="/acceuil" replace />;
}
