// src/routes/ProtectedSection.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/UseAuth';
import {
  canAccessDirectorSpace,
  isSessionDirector,
  isSessionCoach,
  canAccessTeamSpace,
} from '../utils/role';  // adapte le chemin si besoin

const NATIONAL = 'وطني';

type Section =
  | 'admin'
  | 'moderator_national'
  | 'moderator_regional'
  | 'director_space'
  | 'direction_space'
  | 'team_space'
  | 'coach_space';

export default function ProtectedSection({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  const token =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('token') || sessionStorage.getItem('token'))) || null;
  const hydrating = loading || (!!token && !user);

  if (hydrating) return <div style={{ padding: 8 }}>جار التحميل...</div>;

  // pas d'utilisateur => redirection
  if (!user) return <Navigate to="/acceuil" replace state={{ from: location }} />;

  const role = user.role; // 'user' | 'moderator' | 'admin'
  const region = (user.region || '').trim();

  let canAccess = false;

  if (section === 'admin') {
    canAccess = role === 'admin';
  } else if (section === 'moderator_national') {
    canAccess = role === 'admin' || (role === 'moderator' && region === NATIONAL);
  } else if (section === 'moderator_regional') {
    canAccess = role === 'admin' || (role === 'moderator' && region !== NATIONAL);
  } else if (section === 'team_space') {
    // 👉 Ici on délègue à ton helper qui gère déjà director + trainer (+ admin si tu l’as mis dedans)
    canAccess = canAccessDirectorSpace(user);
  }
  else if (section === 'director_space') {
    // 👉 Ici on délègue à ton helper qui gère déjà director + trainer (+ admin si tu l’as mis dedans)
    canAccess = isSessionDirector(user);
  }
  else if (section === 'coach_space') {
    // 👉 Ici on délègue à ton helper qui gère déjà director + trainer (+ admin si tu l’as mis dedans)
    canAccess = isSessionCoach(user);
  }
  else if (section === 'direction_space') {
    // 👉 Ici on délègue à ton helper qui gère déjà director + trainer (+ admin si tu l’as mis dedans)
    canAccess = canAccessTeamSpace(user);
  }
  return canAccess ? <>{children}</> : <Navigate to="/acceuil" replace />;
}
