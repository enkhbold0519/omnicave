import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { authRepository, type AuthRepository, type Session, type User } from '@/data/auth';

interface AuthValue {
  user: User | null;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: AuthRepository['signUp'];
  logOut: () => Promise<void>;
  updateProfile: (input: { username: string; email: string; password?: string }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The current session. In memory for now, so the app starts logged out after a reload. */
export function AuthProvider({ children, repository = authRepository }: { children: ReactNode; repository?: AuthRepository }) {
  const [session, setSession] = useState<Session | null>(null);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      logIn: async (email, password) => setSession(await repository.logIn(email, password)),
      signUp: (input) => repository.signUp(input),
      logOut: async () => {
        if (session) await repository.logOut(session.token);
        setSession(null);
      },
      updateProfile: async (input) => {
        if (!session) throw new Error('Log in first.');
        const user = await repository.updateProfile(session.token, input);
        setSession({ ...session, user });
      },
      deleteAccount: async (password) => {
        if (!session) throw new Error('Log in first.');
        await repository.deleteAccount(session.token, password);
        setSession(null);
      },
    }),
    [repository, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
