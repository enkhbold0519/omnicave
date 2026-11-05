import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/theme/tokens';

export type HomeStateKind = 'loading' | 'empty' | 'error' | 'disconnected' | 'sensorWarning';

interface HomeStateViewProps {
  kind: HomeStateKind;
  /** Overrides the default body copy (e.g. a specific error or sensor message). */
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const config: Record<
  HomeStateKind,
  { title: string; body: string; icon: keyof typeof Ionicons.glyphMap; tone: 'neutral' | 'warning' | 'danger' }
> = {
  loading: { title: 'Loading your cellar', body: 'Gathering the latest readings…', icon: 'hourglass-outline', tone: 'neutral' },
  empty: {
    title: 'Your cellar is empty',
    body: 'Add your first bottle to start tracking your collection.',
    icon: 'wine-outline',
    tone: 'neutral',
  },
  error: {
    title: "We couldn't load your cellar",
    body: 'Something went wrong. Please try again.',
    icon: 'alert-circle-outline',
    tone: 'danger',
  },
  disconnected: {
    title: 'Cellar disconnected',
    body: 'The sensor hub is offline. Readings below may be out of date.',
    icon: 'cloud-offline-outline',
    tone: 'danger',
  },
  sensorWarning: {
    title: 'Sensor warning',
    body: 'A reading is outside the ideal range.',
    icon: 'warning-outline',
    tone: 'warning',
  },
};

const toneColors = {
  neutral: { fg: colors.accent, bg: colors.surface, border: colors.border },
  warning: { fg: colors.warning, bg: colors.warningSoft, border: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft, border: colors.dangerSoft },
};

/** Loading, empty, error and connectivity states for the Home screen. */
export function HomeStateView({ kind, message, actionLabel, onAction }: HomeStateViewProps) {
  const c = config[kind];
  const tone = toneColors[c.tone];
  const isBanner = kind === 'disconnected' || kind === 'sensorWarning';
  const body = message ?? c.body;

  if (kind === 'loading') {
    return (
      <View style={styles.block} accessibilityRole="progressbar" accessibilityLabel={c.title}>
        <ActivityIndicator color={colors.accent} size="large" />
        <AppText variant="bodyStrong">{c.title}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {body}
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[isBanner ? styles.banner : styles.block, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityRole={kind === 'error' || isBanner ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'error' || isBanner ? 'polite' : 'none'}
    >
      <View style={isBanner ? styles.bannerRow : styles.blockHeader}>
        <Ionicons name={c.icon} size={isBanner ? 20 : 32} color={tone.fg} />
        <View style={isBanner ? styles.bannerText : styles.blockText}>
          <AppText variant="bodyStrong" color={isBanner ? tone.fg : colors.textPrimary} style={!isBanner && styles.center}>
            {c.title}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} style={!isBanner && styles.center}>
            {body}
          </AppText>
        </View>
      </View>
      {onAction && actionLabel ? (
        <View style={isBanner ? undefined : styles.action}>
          <Button label={actionLabel} onPress={onAction} variant={kind === 'error' ? 'primary' : 'secondary'} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  blockHeader: { alignItems: 'center', gap: spacing.sm },
  blockText: { alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
  action: { alignSelf: 'center', marginTop: spacing.sm },
  banner: { borderRadius: radii.md, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bannerText: { flex: 1, gap: spacing.xxs },
});
