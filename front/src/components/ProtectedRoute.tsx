import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth.ts';

type Props = { children: React.ReactNode };

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p>Chargement...</p>;

  // si pas connecté -> on renvoie vers la page publique en gardant la destination voulue
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;

  return <>{children}</>;
}