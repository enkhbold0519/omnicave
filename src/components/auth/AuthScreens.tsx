import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { demoAccount, isStrongPassword, isValidEmail, passwordChecks } from '@/data/auth';
import { useAuth } from '@/hooks/AuthContext';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

/** Spec: Log-In → Main page on success, "Invalid email or password" on failure. */
export function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { logIn } = useAuth();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await logIn(email, password);
      // The protected layout switches to the app on its own.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color={colors.textMuted}>
          CellarOS
        </AppText>
        <AppText variant="display" accessibilityRole="header">
          Log in
        </AppText>
      </View>
      {created ? (
        <AppText color={colors.success} accessibilityRole="alert">
          Account created. Log in to continue.
        </AppText>
      ) : null}
      <View style={{ gap: spacing.md }}>
        <TextField label="Email" placeholder="Email" value={email} onChange={setEmail} keyboardType="email-address" autoComplete="email" />
        <TextField label="Password" placeholder="Password" value={password} onChange={setPassword} secure autoComplete="password" />
      </View>
      {error ? (
        <AppText color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={busy ? 'Logging in…' : 'Log In'} disabled={!isValidEmail(email) || !password || busy} onPress={() => void submit()} />
      <Button label="Create an account" variant="link" onPress={() => router.push('/signup')} />
      <AppText variant="caption" color={colors.textMuted}>
        Demo account: {demoAccount.email} · {demoAccount.password}
      </AppText>
    </Page>
  );
}

/** Spec: Sign-Up; button disabled until every input is valid; success → Log-In screen. */
export function SignUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = password.length > 0 && password === confirm;
  const valid = username.trim() && isValidEmail(email) && isStrongPassword(password) && matches;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp({ username, email, password });
      router.replace({ pathname: '/login', params: { created: '1' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page back>
      <AppText variant="display" accessibilityRole="header">
        Create account
      </AppText>
      <View style={{ gap: spacing.md }}>
        <TextField label="Username" placeholder="Username" value={username} onChange={setUsername} autoComplete="username" maxLength={40} />
        <TextField label="Email" placeholder="Email" value={email} onChange={setEmail} keyboardType="email-address" autoComplete="email" />
        {email && !isValidEmail(email) ? <Hint ok={false} label="Enter an email like name@example.com" /> : null}
        <TextField label="Password" placeholder="Password" value={password} onChange={setPassword} secure autoComplete="new-password" />
        <PasswordChecklist password={password} />
        <TextField label="Confirm password" placeholder="Re-enter password" value={confirm} onChange={setConfirm} secure autoComplete="new-password" />
        {confirm ? <Hint ok={matches} label={matches ? 'Passwords match' : "Passwords don't match"} /> : null}
      </View>
      {error ? (
        <AppText color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={busy ? 'Creating account…' : 'Sign Up'} disabled={!valid || busy} onPress={() => void submit()} />
    </Page>
  );
}

/** Spec: Edit User Profile → Save Changes → confirmation message. Leave password empty to keep it. */
export function AccountScreen() {
  const { colors } = useTheme();
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const changingPassword = password.length > 0;
  const valid = username.trim() && isValidEmail(email) && (!changingPassword || (isStrongPassword(password) && password === confirm));

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await updateProfile({ username, email, password: changingPassword ? password : undefined });
      setPassword('');
      setConfirm('');
      setMessage({ ok: true, text: 'Changes saved.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page back>
      <AppText variant="display" accessibilityRole="header">
        Edit profile
      </AppText>
      <View style={{ gap: spacing.md }}>
        <TextField label="Username" placeholder="Username" value={username} onChange={setUsername} autoComplete="username" maxLength={40} />
        <TextField label="Email" placeholder="Email" value={email} onChange={setEmail} keyboardType="email-address" autoComplete="email" />
        <AppText variant="caption" color={colors.textMuted}>
          New password (leave empty to keep the current one)
        </AppText>
        <TextField label="New password" placeholder="New password" value={password} onChange={setPassword} secure autoComplete="new-password" />
        {changingPassword ? (
          <>
            <PasswordChecklist password={password} />
            <TextField label="Confirm new password" placeholder="Re-enter new password" value={confirm} onChange={setConfirm} secure autoComplete="new-password" />
          </>
        ) : null}
      </View>
      {message ? (
        <AppText color={message.ok ? colors.success : colors.danger} accessibilityRole="alert">
          {message.text}
        </AppText>
      ) : null}
      <Button label={busy ? 'Saving…' : 'Save Changes'} disabled={!valid || busy} onPress={() => void submit()} />
    </Page>
  );
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={{ gap: 2 }}>
      {passwordChecks(password).map((c) => (
        <Hint key={c.label} ok={c.ok} label={c.label} />
      ))}
    </View>
  );
}

function Hint({ ok, label }: { ok: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }} accessible accessibilityLabel={`${label}: ${ok ? 'done' : 'not yet'}`}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? colors.success : colors.textMuted} />
      <AppText variant="caption" color={ok ? colors.textSecondary : colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

function Page({ children, back }: { children: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.root}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (back ? spacing.sm : spacing.xxxl), paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        {back ? <BackHeader /> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xl, width: '100%', maxWidth: 480, alignSelf: 'center' },
  }),
);
