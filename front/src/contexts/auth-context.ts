// front/src/contexts/auth-context.ts
import { createContext } from 'react';
export type Role = 'user' | 'moderator' | 'admin';
export type User = {
  _id: string;
  email: string;
  nom: string;
  prenom: string;
  idScout: string;
  region: string;
  niveau: string;
  role:Role;
  isSessionTrainer?: boolean;
  isSessionDirector?: boolean;
  isSessionCoach?: boolean;
  isSessionAssistant?: boolean;
};

export type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setSession: (token: string, user: User) => void;
  refreshMe: () => Promise<void>;
};

export const AuthCtx = createContext<AuthState | undefined>(undefined);
