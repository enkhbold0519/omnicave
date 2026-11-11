/**
 * Accounts and sessions. The mock keeps users in memory; with the backend, FastAPI handles sign-up/log-in,
 * hashes passwords and issues the token (stored in expo-secure-store then).
 */

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface AuthRepository {
  signUp(input: { username: string; email: string; password: string }): Promise<void>;
  /** Rejects with "Invalid email or password" on any mismatch. */
  logIn(email: string, password: string): Promise<Session>;
  logOut(token: string): Promise<void>;
  /** `password` is optional: only sent when the user changes it. */
  updateProfile(token: string, input: { username: string; email: string; password?: string }): Promise<User>;
  /** GDPR right to erasure: permanently delete the account after re-entering the password. */
  deleteAccount(token: string, password: string): Promise<void>;
}

// ── Validation (spec: User Management) ───────────────────────────────────────────────────────────

/** [user]@[domain].[tld] */
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email.trim());

/** The spec's password rules, as a live checklist. */
export function passwordChecks(password: string): { label: string; ok: boolean }[] {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'A lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'A number', ok: /\d/.test(password) },
    { label: 'A special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

export const isStrongPassword = (password: string) => passwordChecks(password).every((c) => c.ok);

// ── Mock ─────────────────────────────────────────────────────────────────────────────────────────

/** Demo account for trying the app. */
export const demoAccount = { username: 'Alex', email: 'alex@cellaros.app', password: 'Cellar#2026' };

const INVALID = 'Invalid email or password';
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMockAuthRepository({ latencyMs = 400 } = {}): AuthRepository {
  // Plain text only because it's an in-memory mock; the backend stores salted hashes.
  let users: (User & { password: string })[] = [{ id: 'user-alex', ...demoAccount }];
  const sessions = new Map<string, string>(); // token → user id
  let seq = 0;

  const byEmail = (email: string) => users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  const checkDetails = (username: string, email: string, password?: string) => {
    if (!username.trim()) throw new Error('Enter a username.');
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    if (password !== undefined && !isStrongPassword(password)) throw new Error("The password doesn't meet the requirements.");
  };
  const publicUser = ({ id, username, email }: User): User => ({ id, username, email });

  return {
    async signUp({ username, email, password }) {
      if (latencyMs) await delay(latencyMs);
      checkDetails(username, email, password);
      if (byEmail(email)) throw new Error('An account with this email already exists.');
      users = [...users, { id: `user-${++seq}`, username: username.trim(), email: email.trim(), password }];
    },

    async logIn(email, password) {
      if (latencyMs) await delay(latencyMs);
      const user = byEmail(email);
      if (!isValidEmail(email) || !user || user.password !== password) throw new Error(INVALID);
      const token = `token-${Date.now().toString(36)}-${++seq}`;
      sessions.set(token, user.id);
      return { token, user: publicUser(user) };
    },

    async logOut(token) {
      sessions.delete(token);
    },

    async updateProfile(token, { username, email, password }) {
      if (latencyMs) await delay(latencyMs);
      const id = sessions.get(token);
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error('Your session has ended. Log in again.');
      checkDetails(username, email, password);
      const other = byEmail(email);
      if (other && other.id !== user.id) throw new Error('An account with this email already exists.');
      const updated = { ...user, username: username.trim(), email: email.trim(), password: password ?? user.password };
      users = users.map((u) => (u.id === user.id ? updated : u));
      return publicUser(updated);
    },

    async deleteAccount(token, password) {
      if (latencyMs) await delay(latencyMs);
      const user = users.find((u) => u.id === sessions.get(token));
      if (!user) throw new Error('Your session has ended. Log in again.');
      if (user.password !== password) throw new Error('That password is not correct.');
      users = users.filter((u) => u.id !== user.id);
      for (const [t, id] of sessions) if (id === user.id) sessions.delete(t);
    },
  };
}

export const authRepository: AuthRepository = createMockAuthRepository();
