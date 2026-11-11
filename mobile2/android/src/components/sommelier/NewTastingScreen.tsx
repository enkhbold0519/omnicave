import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottleEnd } from '@/components/cellar/BottleEnd';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { sommelierRepository } from '@/data/sommelier/mockSommelierRepository';
import { useSommelier } from '@/data/sommelier/sommelierStore';
import { TABLE_MAX, TABLE_MIN, type DebateTopic } from '@/data/sommelier/types';
import type { InventoryData, Wine } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, gutter, radii, spacing, touchTarget, typography } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

export type StartTopic = 'wine' | 'tonight' | 'pairing' | 'open';

const headings: Record<StartTopic, { title: string; body: string }> = {
  wine: { title: 'Discuss a wine', body: 'Each sommelier gives their verdict, then you can join in.' },
  tonight: { title: 'What to open tonight', body: 'Each sommelier picks a ready bottle from your cellars and argues for it.' },
  pairing: { title: 'Pair with my dinner', body: 'Each sommelier picks a bottle from your cellars for your meal.' },
  open: { title: 'Ask anything', body: 'Ask the table a wine question.' },
};

/** Set up a tasting: what to talk about, and who sits at the table (2–5). */
export function NewTastingScreen({ topic, initialWineId }: { topic: StartTopic; initialWineId?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const { reduceMotion } = useAccessibilityPrefs();
  const { inventory } = useActiveCellar();
  const personas = useSommelier((s) => s.personas);

  const [wineId, setWineId] = useState<string | null>(initialWineId ?? null);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  // Default seats: the first three sommeliers. Unchecking or checking adjusts from there.
  const [seated, setSeated] = useState<string[] | null>(null);
  // Drop anyone who has since been deleted.
  const seats = (seated ?? personas.slice(0, 3).map((p) => p.id)).filter((id) => personas.some((p) => p.id === id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wines in any of the user's cellars, for "Discuss a wine".
  const { state } = useQuery<InventoryData>('sommelier|wines', () => inventory.listInventory('all'));
  const cellarWines = useMemo(() => {
    if (state.status !== 'ready') return [];
    const ids = new Set(state.data.bottles.map((b) => b.wineId));
    return state.data.wines.filter((w) => ids.has(w.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [state]);
  const allWines = state.status === 'ready' ? state.data.wines : [];
  const wine: Wine | undefined = allWines.find((w) => w.id === wineId);

  const toggle = (id: string) => {
    setError(null);
    setSeated(seats.includes(id) ? seats.filter((x) => x !== id) : seats.length >= TABLE_MAX ? seats : [...seats, id]);
  };

  const topicReady = topic === 'tonight' || (topic === 'wine' ? !!wineId : text.trim().length > 0);
  const seatsOk = seats.length >= TABLE_MIN && seats.length <= TABLE_MAX;

  const start = async () => {
    const t: DebateTopic =
      topic === 'wine' ? { kind: 'wine', wineId: wineId! } : { kind: 'question', intent: topic, text: topic === 'tonight' ? '' : text.trim() };
    setBusy(true);
    setError(null);
    try {
      const d = await sommelierRepository.startDebate({ topic: t, personaIds: seats });
      router.replace({ pathname: '/tasting/[id]', params: { id: d.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <BackHeader />
        <View style={styles.intro}>
          <AppText variant="display" accessibilityRole="header">
            {headings[topic].title}
          </AppText>
        </View>

        {topic === 'wine' && (
          <Section title="Wine">
            <PressableScale
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={wine ? `Wine: ${wine.name} ${wine.vintage}. Change.` : 'Choose a wine'}
              scaleTo={0.985}
              style={styles.field}
              pressedStyle={styles.pressed}
            >
              {wine ? <BottleEnd style={wine.style} size={20} /> : <Ionicons name="wine-outline" size={18} color={colors.textMuted} />}
              <AppText style={styles.flex} color={wine ? colors.textPrimary : colors.textMuted} numberOfLines={1}>
                {wine ? `${wine.name} ${wine.vintage}` : 'Choose a wine from your cellars'}
              </AppText>
              <AppText variant="caption" color={colors.accent}>
                {wine ? 'Change' : 'Choose'}
              </AppText>
            </PressableScale>
          </Section>
        )}

        {(topic === 'pairing' || topic === 'open') && (
          <Section title={topic === 'pairing' ? 'Your meal' : 'Your question'}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={topic === 'pairing' ? 'e.g. Roast lamb with rosemary' : 'e.g. Should I start collecting Barolo?'}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              style={[styles.field, styles.input]}
              multiline
              maxLength={200}
              accessibilityLabel={topic === 'pairing' ? 'Describe your meal' : 'Your question for the table'}
            />
          </Section>
        )}

        <Section title={`At the table · ${seats.length} of ${TABLE_MAX}`}>
          <View style={styles.rows}>
            {personas.map((p) => {
              const on = seats.includes(p.id);
              const full = !on && seats.length >= TABLE_MAX;
              return (
                <PressableScale
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  disabled={full}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: full }}
                  accessibilityLabel={`${p.name}, ${p.title}`}
                  accessibilityHint={full ? 'The table is full' : undefined}
                  scaleTo={0.985}
                  style={[styles.row, full && styles.disabled]}
                  pressedStyle={styles.pressed}
                >
                  <PersonaAvatar persona={p} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{p.name}</AppText>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {p.title}
                    </AppText>
                  </View>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.accent : colors.textMuted} />
                </PressableScale>
              );
            })}
          </View>
          <Button label="Add or edit sommeliers" variant="link" onPress={() => router.push('/sommeliers')} />
        </Section>

        {error ? (
          <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <PressableScale
          onPress={start}
          disabled={!topicReady || !seatsOk || busy}
          accessibilityRole="button"
          accessibilityLabel="Start the tasting"
          accessibilityState={{ disabled: !topicReady || !seatsOk || busy }}
          scaleTo={0.98}
          style={[styles.start, (!topicReady || !seatsOk || busy) && styles.disabled]}
          pressedStyle={styles.startPressed}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.textOnAccent} />
          <AppText variant="bodyStrong" color={colors.textOnAccent}>
            {busy ? 'Seating the table…' : 'Start the tasting'}
          </AppText>
        </PressableScale>
      </ScrollView>

      <PickerSheet
        visible={picking}
        title="Choose a wine"
        reduceMotion={reduceMotion}
        sections={[
          {
            items: cellarWines.map((w) => ({
              id: w.id,
              title: `${w.name} ${w.vintage}`,
              detail: `${w.style} · ${w.producer}`,
              leading: <BottleEnd style={w.style} size={18} />,
            })),
          },
        ]}
        onPick={(id) => {
          setWineId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    intro: { gap: spacing.sm },
    flex: { flex: 1, gap: spacing.xxs },
    field: {
      minHeight: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    input: {
      minHeight: 72,
      paddingVertical: spacing.md,
      textAlignVertical: 'top',
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
    },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.45 },
    start: {
      minHeight: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: c.accent,
    },
    startPressed: { backgroundColor: c.accentPressed },
  }),
);
