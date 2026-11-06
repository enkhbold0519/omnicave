import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { personaColors } from '@/data/sommelier/personas';
import type { Persona, Verdict } from '@/data/sommelier/types';
import type { Wine } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

interface Props {
  verdict: Verdict;
  participants: Persona[];
  wines: Wine[];
  now: Date;
  onOpenWine: (id: string) => void;
}

/** The end of a tasting: scores side by side with a drinking-window timeline, or each sommelier's pick. */
export function VerdictCard({ verdict, participants, wines, now, onOpenWine }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const persona = (id: string) => participants.find((p) => p.id === id);

  if (verdict.kind === 'question') {
    return (
      <View style={styles.card}>
        <AppText variant="overline" color={colors.textMuted} accessibilityRole="header">
          Their picks
        </AppText>
        {verdict.picks.length === 0 && <AppText color={colors.textSecondary}>No bottles were picked.</AppText>}
        {verdict.picks.map(({ personaId, wineId }) => {
          const p = persona(personaId);
          const w = wines.find((x) => x.id === wineId);
          if (!p || !w) return null;
          return (
            <PressableScale
              key={personaId}
              onPress={() => onOpenWine(w.id)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name} picked ${w.name} ${w.vintage}`}
              scaleTo={0.985}
              style={styles.row}
              pressedStyle={styles.pressed}
            >
              <PersonaAvatar persona={p} size={28} />
              <View style={styles.flex}>
                <AppText variant="caption" color={colors.textMuted}>
                  {p.name}
                </AppText>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {w.name} {w.vintage}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </PressableScale>
          );
        })}
      </View>
    );
  }

  const wine = wines.find((w) => w.id === verdict.wineId);
  if (!wine) return null;
  const year = now.getFullYear();
  const start = Math.min(wine.drinkFrom, year) - 1;
  const end = wine.drinkUntil + 1;
  const x = (y: number) => `${((y - start) / (end - start)) * 100}%` as const;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="overline" color={colors.textMuted} accessibilityRole="header" style={styles.flexText}>
          Verdict
        </AppText>
        <AppText variant="caption" color={verdict.agreement === 'consensus' ? colors.success : colors.warning}>
          {verdict.agreement === 'consensus' ? 'Consensus' : 'Split decision'}
        </AppText>
      </View>

      {verdict.scores.map(({ personaId, score, peakYear }) => {
        const p = persona(personaId);
        if (!p) return null;
        return (
          <View key={personaId} style={styles.row} accessible accessibilityLabel={`${p.name}: ${score.label}, peak around ${peakYear}`}>
            <PersonaAvatar persona={p} size={28} />
            <AppText style={styles.flexText} numberOfLines={1}>
              {p.name}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Peak {peakYear}
            </AppText>
            <AppText variant="bodyStrong" style={styles.scoreText}>
              {score.label}
            </AppText>
          </View>
        );
      })}

      {/* Drinking-window timeline: the window, today, and where each sommelier expects the peak. */}
      <View
        style={styles.timeline}
        accessible
        accessibilityLabel={`Drinking window ${wine.drinkFrom} to ${wine.drinkUntil}. Today is ${year}.`}
      >
        <View style={styles.track}>
          <View style={styles.base} />
          <View style={[styles.window, { left: x(wine.drinkFrom), width: `${((wine.drinkUntil - wine.drinkFrom) / (end - start)) * 100}%` }]} />
          <View style={[styles.now, { left: x(year) }]} />
          {verdict.scores.map(({ personaId, peakYear }) => {
            const p = persona(personaId);
            return p ? (
              <View key={personaId} style={[styles.peak, { left: x(peakYear), backgroundColor: personaColors[p.colorIndex] ?? personaColors[0] }]} />
            ) : null;
          })}
        </View>
        <View style={styles.axis}>
          <AppText variant="caption" color={colors.textMuted}>
            {wine.drinkFrom}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Today {year}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {wine.drinkUntil}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    header: { flexDirection: 'row', alignItems: 'center' },
    flex: { flex: 1, gap: 2 },
    flexText: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
    scoreText: { minWidth: 56, textAlign: 'right' },
    pressed: { opacity: 0.6 },
    timeline: { gap: spacing.xs, marginTop: spacing.xs },
    track: { height: 14, justifyContent: 'center' },
    base: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: c.hairline },
    window: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: c.accentSoft },
    now: { position: 'absolute', width: 2, height: 14, marginLeft: -1, backgroundColor: c.textPrimary },
    peak: { position: 'absolute', width: 10, height: 10, marginLeft: -5, borderRadius: 5, borderWidth: 1.5, borderColor: c.surface },
    axis: { flexDirection: 'row', justifyContent: 'space-between' },
  }),
);
