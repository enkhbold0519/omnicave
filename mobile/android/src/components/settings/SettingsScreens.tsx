import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Section } from '@/components/ui/Section';
import { SettingRow } from '@/components/ui/SettingRow';
import { TextField } from '@/components/ui/TextField';
import { capacityOf, LG_SIGNATURE_65 } from '@/data/cellarLayout';
import { formatMinutes, limits, updateAlerts, updateTaste, useSettings, type TastePreferences } from '@/data/settings';
import type { WineStyle } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAuth } from '@/hooks/AuthContext';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

/** Back, title, one short line of context, then the content. */
function SettingsPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.root}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
    >
      <BackHeader label="Profile" />
      <View style={styles.intro}>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        {intro ? <AppText color={colors.textSecondary}>{intro}</AppText> : null}
      </View>
      {children}
    </ScrollView>
  );
}

// ── My cellars ───────────────────────────────────────────────────────────────────────────────────

/** Spec: a cellar management interface listing every unit, with add, rename and select. */
export function CellarsScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { cellars, activeCellar } = useActiveCellar();
  return (
    <SettingsPage title="My cellars">
      <View style={styles.rows}>
        {cellars.map((c) => (
          <SettingRow
            key={c.id}
            label={c.name}
            value={c.id === activeCellar?.id ? 'Active' : c.location}
            onPress={() => router.push({ pathname: '/settings/cellar', params: { id: c.id } })}
          />
        ))}
        <SettingRow label="Add a cellar" onPress={() => router.push('/settings/cellar')} />
      </View>
    </SettingsPage>
  );
}

/** Add a cellar, or rename one and make it the active cellar. */
export function CellarFormScreen({ cellarId }: { cellarId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { repository, cellars, activeCellar, setActiveCellarId } = useActiveCellar();
  const existing = cellars.find((c) => c.id === cellarId);
  const [name, setName] = useState(existing?.name ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cellarId && !existing) {
    return (
      <SettingsPage title="Cellar not found">
        <AppText color={colors.textSecondary}>It may have been removed.</AppText>
      </SettingsPage>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) await repository.renameCellar(existing.id, { name, location });
      else await repository.addCellar({ name, location });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title={existing ? 'Edit cellar' : 'Add a cellar'}>
      <View style={{ gap: spacing.md }}>
        <TextField label="Cellar name" placeholder="Name, e.g. Lake House" value={name} onChange={setName} maxLength={40} />
        <TextField label="Location" placeholder="Location, e.g. Kitchen" value={location} onChange={setLocation} maxLength={60} />
        <AppText variant="caption" color={colors.textMuted}>
          {LG_SIGNATURE_65.model} · {capacityOf(LG_SIGNATURE_65)} positions
        </AppText>
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Button label={busy ? 'Saving…' : existing ? 'Save Changes' : 'Add cellar'} disabled={!name.trim() || busy} onPress={() => void save()} />
        {existing && existing.id !== activeCellar?.id ? (
          <Button label="Make this my active cellar" variant="link" onPress={() => setActiveCellarId(existing.id)} />
        ) : null}
        {existing && existing.id === activeCellar?.id ? (
          <AppText variant="caption" color={colors.textMuted}>
            This is your active cellar.
          </AppText>
        ) : null}
      </View>
    </SettingsPage>
  );
}

// ── Notifications & alerts ───────────────────────────────────────────────────────────────────────

/** Spec: user-defined thresholds and duration, sensor timeout, drinking-window notice, briefing time. */
export function AlertsScreen() {
  const { alerts } = useSettings();
  const t = limits.temp.step;
  const h = limits.humidity.step;
  return (
    <SettingsPage title="Notifications & alerts" intro="For all your cellars.">
      <Section title="Temperature">
        <Stepper label="Lowest" value={`${alerts.tempMin.toFixed(1)} °C`} onMinus={() => updateAlerts({ tempMin: alerts.tempMin - t })} onPlus={() => updateAlerts({ tempMin: alerts.tempMin + t })} />
        <Stepper label="Highest" value={`${alerts.tempMax.toFixed(1)} °C`} onMinus={() => updateAlerts({ tempMax: alerts.tempMax - t })} onPlus={() => updateAlerts({ tempMax: alerts.tempMax + t })} />
      </Section>
      <Section title="Humidity">
        <Stepper label="Lowest" value={`${alerts.humidityMin} %`} onMinus={() => updateAlerts({ humidityMin: alerts.humidityMin - h })} onPlus={() => updateAlerts({ humidityMin: alerts.humidityMin + h })} />
        <Stepper label="Highest" value={`${alerts.humidityMax} %`} onMinus={() => updateAlerts({ humidityMax: alerts.humidityMax - h })} onPlus={() => updateAlerts({ humidityMax: alerts.humidityMax + h })} />
      </Section>
      <Choice
        title="Alert when outside the range for"
        options={[15, 30, 60, 120].map((m) => ({ label: formatMinutes(m), value: m }))}
        value={alerts.outOfRangeMinutes}
        onChange={(v) => updateAlerts({ outOfRangeMinutes: v })}
      />
      <Choice
        title="Sensor counts as offline after"
        options={[5, 15, 30, 60].map((m) => ({ label: formatMinutes(m), value: m }))}
        value={alerts.sensorTimeoutMinutes}
        onChange={(v) => updateAlerts({ sensorTimeoutMinutes: v })}
      />
      <Choice
        title="Heads-up before a drinking window opens"
        options={[
          { label: 'Off', value: 0 },
          { label: '1 month', value: 1 },
          { label: '3 months', value: 3 },
          { label: '6 months', value: 6 },
        ]}
        value={alerts.drinkingNoticeMonths}
        onChange={(v) => updateAlerts({ drinkingNoticeMonths: v })}
      />
      <Choice
        title="Daily briefing"
        options={[
          { label: 'Off', value: 'off' },
          { label: '07:00', value: '07:00' },
          { label: '08:00', value: '08:00' },
          { label: '12:00', value: '12:00' },
          { label: '18:00', value: '18:00' },
        ]}
        value={alerts.briefingTime ?? 'off'}
        onChange={(v) => updateAlerts({ briefingTime: v === 'off' ? null : v })}
      />
    </SettingsPage>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value}`} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onPlus() : onMinus())}>
      <AppText variant="heading" style={styles.flex}>
        {label}
      </AppText>
      <IconButton icon="remove" accessibilityLabel={`Lower ${label.toLowerCase()}`} onPress={onMinus} />
      <AppText style={styles.stepValue}>{value}</AppText>
      <IconButton icon="add" accessibilityLabel={`Raise ${label.toLowerCase()}`} onPress={onPlus} />
    </View>
  );
}

function Choice<T extends string | number>({ title, options, value, onChange }: { title: string; options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const styles = useStyles();
  return (
    <Section title={title}>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </Section>
  );
}

// ── Taste preferences ────────────────────────────────────────────────────────────────────────────

const tasteOptions: { key: keyof TastePreferences; title: string; options: string[] }[] = [
  { key: 'styles', title: 'Styles', options: ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'] },
  { key: 'regions', title: 'Regions', options: ['Bordeaux', 'Burgundy', 'Champagne', 'Rhône', 'Piedmont', 'Tuscany', 'Rioja', 'Mosel', 'Napa', 'Mendoza'] },
  { key: 'grapes', title: 'Grapes', options: ['Cabernet Sauvignon', 'Pinot Noir', 'Nebbiolo', 'Syrah', 'Sangiovese', 'Tempranillo', 'Chardonnay', 'Riesling', 'Sauvignon Blanc', 'Grenache'] },
];

/** Spec: saved preferences used by personalised recommendations. */
export function TasteScreen() {
  const { taste } = useSettings();
  const styles = useStyles();
  const toggle = (key: keyof TastePreferences, item: string) => {
    const current = taste[key] as string[];
    const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
    updateTaste({ [key]: next } as Partial<TastePreferences>);
  };
  return (
    <SettingsPage title="Taste preferences">
      {tasteOptions.map((group) => (
        <Section key={group.key} title={group.title}>
          <View style={styles.chips}>
            {group.options.map((o) => (
              <Chip key={o} label={o} role="checkbox" selected={(taste[group.key] as string[]).includes(o as WineStyle)} onPress={() => toggle(group.key, o)} />
            ))}
          </View>
        </Section>
      ))}
    </SettingsPage>
  );
}

// ── Privacy & data ───────────────────────────────────────────────────────────────────────────────

/** Spec (GDPR): export your data, or permanently delete your account. */
export function PrivacyScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user, deleteAccount } = useAuth();
  const [exported, setExported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password); // logging out returns to the log-in screen
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <SettingsPage title="Privacy & data">
      <View style={styles.rows}>
        <SettingRow label="Export my data" onPress={() => setExported(true)} />
        <SettingRow label="Delete account" onPress={() => setDeleting(true)} />
      </View>

      {exported ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <Ionicons name="mail-outline" size={18} color={colors.accent} />
          <AppText color={colors.textSecondary} style={styles.flex}>
            Your data will be emailed to {user?.email}.
          </AppText>
        </View>
      ) : null}

      {deleting ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodyStrong">Delete your account permanently?</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            Your cellars, bottles, history and sommeliers are removed and can&apos;t be recovered. Enter your password to confirm.
          </AppText>
          <TextField label="Password" placeholder="Password" value={password} onChange={setPassword} secure autoComplete="password" />
          {error ? (
            <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label={busy ? 'Deleting…' : 'Delete my account'} disabled={!password || busy} onPress={() => void confirmDelete()} />
            <Button label="Keep my account" variant="link" onPress={() => setDeleting(false)} />
          </View>
        </View>
      ) : null}
    </SettingsPage>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    intro: { gap: spacing.sm },
    flex: { flex: 1 },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    stepValue: { minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
    note: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: 10, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.lg },
  }),
);
