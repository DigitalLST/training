// src/routes/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth';

type Props = { children: React.ReactNode };

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  const token =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('token') || sessionStorage.getItem('token'))) || null;
  const hydrating = loading || (!!token && !user);

  if (hydrating) return <div style={{ padding: 8 }}>جار التحميل...</div>;

  // si pas connecté -> redirection vers la page d'accueil
  if (!user) return <Navigate to="/acceuil" replace state={{ from: location }} />;

  return <>{children}</>;
}
