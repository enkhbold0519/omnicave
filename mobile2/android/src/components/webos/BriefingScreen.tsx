import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { getCondition } from '@/data/derive';
import type { HomeSnapshot } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

/** Mobile daily briefing, built from the same cellar snapshot used by Home. */
export function BriefingScreen() {
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const { colors } = useTheme();
  const styles = useStyles();
  const { repository, cellars } = useActiveCellar();
  const { state, reload } = useQuery<HomeSnapshot[]>(`briefing|${cellars.map((c) => c.id).join(',')}`, () =>
    Promise.all(cellars.map((c) => repository.getHomeSnapshot(c.id, now))),
  );

  const snapshots = state.status === 'ready' ? state.data : [];
  const insights = snapshots.flatMap((s) => {
    const condition = getCondition(s.environment, now);
    const items: { cellarId: string; text: string; warning: boolean }[] = [];
    if (condition === 'disconnected') items.push({ cellarId: s.cellar.id, text: s.environment.sensorMessage ?? 'Sensor disconnected', warning: true });
    else if (condition === 'attention') items.push({ cellarId: s.cellar.id, text: s.environment.sensorMessage ?? 'Cellar conditions need attention', warning: true });
    else if (condition === 'stale') items.push({ cellarId: s.cellar.id, text: 'The latest sensor reading is out of date', warning: true });
    else items.push({ cellarId: s.cellar.id, text: `Conditions stable at ${s.environment.temperatureC.toFixed(1)}°C and ${Math.round(s.environment.humidityPct)}% humidity`, warning: false });
    if (s.briefing) items.push({ cellarId: s.cellar.id, text: s.briefing.summary, warning: false });
    items.push({ cellarId: s.cellar.id, text: `${s.bottleCount} bottles currently stored`, warning: false });
    return items;
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }]}>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">Daily Briefing</AppText>
        <AppText color={colors.textSecondary}>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</AppText>
      </View>
      {state.status === 'loading' && <AppText color={colors.textMuted}>Preparing your cellar briefing…</AppText>}
      {state.status === 'error' && <View style={styles.error}><AppText color={colors.danger}>Could not load the briefing.</AppText><Button label="Try again" variant="secondary" onPress={reload} /></View>}
      {state.status === 'ready' && (
        <>
          <View style={styles.hero}>
            <Ionicons name="sunny-outline" size={24} color={colors.accent} />
            <AppText variant="heading">Your cellars at a glance</AppText>
            <AppText color={colors.textSecondary}>{snapshots.length} {snapshots.length === 1 ? 'cellar' : 'cellars'} · {snapshots.reduce((n, s) => n + s.bottleCount, 0)} bottles</AppText>
          </View>
          {snapshots.map((s) => (
            <Section key={s.cellar.id} title={s.cellar.name}>
              <View style={styles.rows}>
                {insights.filter((i) => i.cellarId === s.cellar.id).map((i, index) => (
                  <View key={`${s.cellar.id}-${index}`} style={styles.row}>
                    <Ionicons name={i.warning ? 'warning-outline' : 'checkmark-circle-outline'} size={18} color={i.warning ? colors.warning : colors.accent} />
                    <View style={styles.flex}><AppText>{i.text}</AppText></View>
                  </View>
                ))}
              </View>
            </Section>
          ))}
          <AppText variant="caption" color={colors.textMuted}>This mobile briefing uses the cellar's locally available status and briefing notes. Market news and scheduled push delivery are not connected in this build.</AppText>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: gutter, gap: spacing.xl },
  header: { gap: spacing.xs },
  error: { gap: spacing.sm },
  hero: { padding: spacing.lg, borderRadius: 18, backgroundColor: c.surface, gap: spacing.sm },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
  flex: { flex: 1 },
}));
