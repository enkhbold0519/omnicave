import { describe, expect, it } from '@jest/globals';

import { createMockAuthRepository, demoAccount, isStrongPassword, isValidEmail, passwordChecks } from '../auth';

const repo = () => createMockAuthRepository({ latencyMs: 0 });
const strong = 'Grand#Cru9';

describe('validation (spec: User Management)', () => {
  it('accepts name@domain.tld emails only', () => {
    expect(isValidEmail('alex@cellaros.app')).toBe(true);
    expect(isValidEmail('jun@korea.co.kr')).toBe(true);
    expect(isValidEmail('alex@cellaros')).toBe(false);
    expect(isValidEmail('alex cellaros.app')).toBe(false);
    expect(isValidEmail('@cellaros.app')).toBe(false);
  });

  it('requires 8+ characters with lower, upper, number and special', () => {
    expect(isStrongPassword(strong)).toBe(true);
    expect(isStrongPassword('grand#cru9')).toBe(false);
    expect(isStrongPassword('GRAND#CRU9')).toBe(false);
    expect(isStrongPassword('Grand#Cru')).toBe(false);
    expect(isStrongPassword('GrandCru99')).toBe(false);
    expect(isStrongPassword('Gr#9a')).toBe(false);
    expect(passwordChecks('').every((c) => !c.ok)).toBe(true);
  });
});

describe('mock auth', () => {
  it('signs up, then logs in with the new account', async () => {
    const r = repo();
    await r.signUp({ username: 'Jun', email: 'jun@example.com', password: strong });
    const session = await r.logIn('JUN@example.com', strong);
    expect(session.user).toMatchObject({ username: 'Jun', email: 'jun@example.com' });
    expect(session.token).toBeTruthy();
  });

  it('rejects duplicate emails and weak passwords at sign-up', async () => {
    const r = repo();
    await expect(r.signUp({ username: 'A', email: demoAccount.email, password: strong })).rejects.toThrow('already exists');
    await expect(r.signUp({ username: 'A', email: 'a@example.com', password: 'weak' })).rejects.toThrow('requirements');
  });

  it('answers "Invalid email or password" for unknown email or wrong password', async () => {
    const r = repo();
    await expect(r.logIn('nobody@example.com', strong)).rejects.toThrow('Invalid email or password');
    await expect(r.logIn(demoAccount.email, 'Wrong#Pass1')).rejects.toThrow('Invalid email or password');
    await expect(r.logIn(demoAccount.email, demoAccount.password)).resolves.toBeTruthy();
  });

  it('edits the profile, and ends the session on log out', async () => {
    const r = repo();
    const { token } = await r.logIn(demoAccount.email, demoAccount.password);
    const user = await r.updateProfile(token, { username: 'Alexandra', email: 'alexandra@cellaros.app', password: strong });
    expect(user.username).toBe('Alexandra');
    await expect(r.logIn('alexandra@cellaros.app', strong)).resolves.toBeTruthy();
    await r.logOut(token);
    await expect(r.updateProfile(token, { username: 'X', email: 'x@example.com' })).rejects.toThrow('session');
  });
});
