import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { formatRelativeTime, isOutOfRange, isStale } from '@/data/derive';
import type { EnvironmentReading } from '@/data/types';
import { colors, fonts, radii, spacing, touchTarget } from '@/theme/tokens';

interface CellarStatusCardProps {
  environment: EnvironmentReading;
  bottleCount: number;
  now: Date;
  onPressStatus: () => void;
  onPressBottles: () => void;
}

type Freshness = { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap };

function getFreshness(env: EnvironmentReading, now: Date): Freshness {
  if (env.connection === 'offline') {
    return { label: 'Offline', color: colors.danger, bg: colors.dangerSoft, icon: 'cloud-offline-outline' };
  }
  if (isStale(env, now)) {
    return { label: 'Stale', color: colors.warning, bg: colors.warningSoft, icon: 'time-outline' };
  }
  return { label: 'Live', color: colors.success, bg: colors.accentSoft, icon: 'radio-button-on' };
}

function sensorLine(env: EnvironmentReading): { text: string; color: string } {
  if (env.sensor === 'unavailable') return { text: env.sensorMessage ?? 'Sensor unavailable', color: colors.danger };
  if (env.sensor === 'warning') return { text: env.sensorMessage ?? 'Sensor warning', color: colors.warning };
  if (isOutOfRange(env)) return { text: 'Outside ideal range', color: colors.warning };
  return { text: 'Sensors normal', color: colors.success };
}

export function CellarStatusCard({ environment, bottleCount, now, onPressStatus, onPressBottles }: CellarStatusCardProps) {
  const freshness = getFreshness(environment, now);
  const sensor = sensorLine(environment);
  const updated = formatRelativeTime(environment.recordedAt, now);
  const stale = freshness.label !== 'Live';
  const bottlesLabel = `${bottleCount} ${bottleCount === 1 ? 'bottle' : 'bottles'}`;
  const valueColor = stale ? colors.textSecondary : colors.textPrimary;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPressBottles}
        accessibilityRole="button"
        accessibilityLabel={`${bottlesLabel} in this cellar`}
        accessibilityHint="Opens your inventory"
        style={({ pressed }) => [styles.row, styles.bottles, pressed && styles.pressed]}
      >
        <AppText variant="title" style={styles.flex}>
          {bottlesLabel}
        </AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        onPress={onPressStatus}
        accessibilityRole="button"
        accessibilityLabel={
          `Cellar status. ${freshness.label}. Temperature ${environment.temperatureC.toFixed(1)} degrees Celsius, ` +
          `humidity ${environment.humidityPct} percent. ${sensor.text}. ` +
          `${environment.connection === 'online' ? 'Connected' : 'Disconnected'}. Updated ${updated}.`
        }
        accessibilityHint="Opens cellar details"
        style={({ pressed }) => [styles.status, pressed && styles.pressed]}
      >
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <AppText variant="caption" color={colors.textMuted}>
              Temperature
            </AppText>
            <AppText variant="title" color={valueColor}>
              {environment.temperatureC.toFixed(1)}°C
            </AppText>
          </View>
          <View style={styles.metric}>
            <AppText variant="caption" color={colors.textMuted}>
              Humidity
            </AppText>
            <AppText variant="title" color={valueColor}>
              {environment.humidityPct}% RH
            </AppText>
          </View>
          <View style={[styles.pill, { backgroundColor: freshness.bg }]}>
            <Ionicons name={freshness.icon} size={12} color={freshness.color} />
            <AppText variant="caption" color={freshness.color} style={styles.pillText}>
              {freshness.label}
            </AppText>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: sensor.color }]} />
          <AppText variant="caption" color={sensor.color} style={styles.flex}>
            {sensor.text} · {environment.connection === 'online' ? 'Connected' : 'Disconnected'}
          </AppText>
        </View>

        <View style={styles.row}>
          <AppText variant="caption" color={stale ? freshness.color : colors.textMuted} style={styles.flex}>
            {stale ? `Last reading ${updated}` : `Updated ${updated}`}
          </AppText>
          <AppText variant="bodyStrong" color={colors.accent}>
            View cellar
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  bottles: { minHeight: touchTarget + 8, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.xl },
  status: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.sm },
  pressed: { backgroundColor: colors.surfaceMuted },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: spacing.xl, rowGap: spacing.sm },
  metric: { gap: spacing.xxs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    marginLeft: 'auto',
  },
  pillText: { fontFamily: fonts.semiBold },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
