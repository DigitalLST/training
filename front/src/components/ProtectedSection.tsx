import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth';

const NATIONAL = 'وطني';

export default function ProtectedSection({
  section,
  children,
}: {
  section: 'moderator_national' | 'moderator_regional' | 'admin';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // attente hydratation si token existe mais user pas encore chargé
  const token =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('token') || sessionStorage.getItem('token'))) || null;
  const hydrating = loading || (!!token && !user);

  if (hydrating) return <div style={{ padding: 8 }}>جار التحميل...</div>;

  // pas d'utilisateur => redirection
  if (!user) return <Navigate to="/acceuil" replace state={{ from: location }} />;

  const role = user.role; // 'user' | 'moderator' | 'admin'
  const region = (user.region || '').trim();

  // règles d’accès précises
  let canAccess = false;

  if (section === 'admin') {
    canAccess = role === 'admin';
  } else if (section === 'moderator_national') {
    canAccess = role === 'admin' || (role === 'moderator' && region === NATIONAL);
  } else if (section === 'moderator_regional') {
    canAccess = role === 'admin' || (role === 'moderator' && region !== NATIONAL);
  }

  return canAccess ? <>{children}</> : <Navigate to="/acceuil" replace />;
}
