import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatRelativeTime, isOutOfRange, isStale } from '@/data/derive';
import type { EnvironmentReading } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, touchTarget, type Colors } from '@/theme/tokens';

interface CellarStatusCardProps {
  environment: EnvironmentReading;
  bottleCount: number;
  now: Date;
  onPressStatus: () => void;
  onPressBottles: () => void;
}

type Freshness = { label: 'Live' | 'Stale' | 'Offline'; color: string };

function getFreshness(env: EnvironmentReading, now: Date, c: Colors): Freshness {
  if (env.connection === 'offline') return { label: 'Offline', color: c.danger };
  if (isStale(env, now)) return { label: 'Stale', color: c.warning };
  return { label: 'Live', color: c.success };
}

function sensorLine(env: EnvironmentReading, c: Colors): { text: string; color: string } {
  if (env.sensor === 'unavailable') return { text: env.sensorMessage ?? 'Sensor unavailable', color: c.danger };
  if (env.sensor === 'warning') return { text: env.sensorMessage ?? 'Sensor warning', color: c.warning };
  if (isOutOfRange(env)) return { text: 'Outside ideal range', color: c.warning };
  return { text: 'Sensors normal', color: c.textMuted };
}

export function CellarStatusCard({ environment, bottleCount, now, onPressStatus, onPressBottles }: CellarStatusCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const freshness = getFreshness(environment, now, colors);
  const sensor = sensorLine(environment, colors);
  const updated = formatRelativeTime(environment.recordedAt, now);
  const live = freshness.label === 'Live';
  const connected = environment.connection === 'online' ? 'Connected' : 'Disconnected';
  const valueColor = live ? colors.textPrimary : colors.textMuted;

  return (
    <View style={styles.card}>
      <PressableScale
        onPress={onPressBottles}
        accessibilityRole="button"
        accessibilityLabel={`${bottleCount} ${bottleCount === 1 ? 'bottle' : 'bottles'} in this cellar`}
        accessibilityHint="Opens your inventory"
        scaleTo={0.985}
        style={styles.bottles}
        pressedStyle={styles.pressed}
      >
        <AppText variant="hero">{bottleCount}</AppText>
        <AppText variant="overline" color={colors.textMuted} style={styles.flex}>
          {bottleCount === 1 ? 'Bottle' : 'Bottles'}
        </AppText>
        <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
      </PressableScale>

      <View style={styles.divider} />

      <PressableScale
        onPress={onPressStatus}
        accessibilityRole="button"
        accessibilityLabel={
          `Cellar status, ${freshness.label}. Temperature ${environment.temperatureC.toFixed(1)} degrees Celsius, ` +
          `humidity ${environment.humidityPct} percent. ${sensor.text}. ${connected}. Updated ${updated}.`
        }
        accessibilityHint="Opens cellar details"
        scaleTo={0.985}
        style={styles.status}
        pressedStyle={styles.pressed}
      >
        <View style={styles.metricsRow}>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <AppText variant="overline" color={colors.textMuted}>
                Temperature
              </AppText>
              <AppText variant="headline" color={valueColor}>
                {environment.temperatureC.toFixed(1)}°C
              </AppText>
            </View>
            <View style={styles.metric}>
              <AppText variant="overline" color={colors.textMuted}>
                Humidity
              </AppText>
              <AppText variant="headline" color={valueColor}>
                {environment.humidityPct}%
              </AppText>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </View>

        <View style={styles.meta}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: freshness.color }]} />
            <AppText variant="caption" color={live ? colors.textSecondary : freshness.color} style={styles.flex}>
              {freshness.label} · {live ? `updated ${updated}` : `last reading ${updated}`}
            </AppText>
          </View>
          <AppText variant="caption" color={sensor.color}>
            {sensor.text} · {connected}
          </AppText>
        </View>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bottles: {
      minHeight: touchTarget + 16,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginHorizontal: spacing.xl },
    status: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
    },
    pressed: { backgroundColor: c.surfaceMuted },
    metricsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    metrics: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xxxl, rowGap: spacing.md },
    metric: { gap: spacing.xs },
    meta: { gap: spacing.xs },
    dot: { width: 6, height: 6, borderRadius: 3 },
  }),
);
