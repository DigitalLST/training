// front/src/contexts/auth-context.ts
import { createContext } from 'react';

export type User = {
  _id: string;
  email: string;
  nom: string;
  prenom: string;
  idScout: string;
  region: string;
  niveau: string;
  isAdmin?: boolean | string | number;
  isModerator?: boolean | string | number;
  isSuperAdmin?: boolean | string | number;
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
