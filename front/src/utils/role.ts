// src/utils/roles.ts
import type {User} from '../contexts/auth-context';

export const NATIONAL_REGION = 'وطني';

export function isAdmin(user: any) {
  return user?.role === 'admin';
}

export function isModerator(user: any) {
  return user?.role === 'moderator';
}

export function isUser(user: any) {
  return user?.role === 'user';
}

export function isNational(user: any) {
  return (user?.region || '').trim() === NATIONAL_REGION;
}

/** Même logique que requireModeratorNational (mais en version "booléenne" pour le front) */
export function canAccessModeratorNational(user: any) {
  return (isModerator(user) && isNational(user)) || isAdmin(user);
}

/** Même logique que requireModeratorRegional */
export function canAccessModeratorRegional(user: any) {
  return isModerator(user) && !isNational(user);
}

/* -------- roles de session -------- */

export function isSessionTrainer(user: User | null | undefined): boolean {
  return !!user?.isSessionTrainer;
}

export function isSessionDirector(user: User | null | undefined): boolean {
  return !!user?.isSessionDirector;
}

export function isSessionCoach(user: User | null | undefined): boolean {
  return !!user?.isSessionCoach;
}

export function isSessionAssistant(user: User | null | undefined): boolean {
  return !!user?.isSessionAssistant;
}

/** Accès à فضاء قائد الدورة */
export function canAccessDirectorSpace(user: User | null | undefined): boolean {
  // à adapter selon ta règle métier
  return (
    isSessionDirector(user) ||
    isSessionTrainer(user) ||
    isSessionAssistant(user) 
  );
}
export function canAccessTeamSpace(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    isSessionDirector(user) ||
    isSessionTrainer(user) ||
    isSessionAssistant(user) ||
    isSessionCoach(user)
  );
}
