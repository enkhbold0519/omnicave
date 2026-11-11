import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, type Colors } from '@/theme/tokens';

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

const toneColors = (c: Colors) => ({
  neutral: { fg: c.accent, bg: c.surface },
  warning: { fg: c.warning, bg: c.warningSoft },
  danger: { fg: c.danger, bg: c.dangerSoft },
});

/** Loading, empty, error and connectivity states for the Home screen. */
export function HomeStateView({ kind, message, actionLabel, onAction }: HomeStateViewProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const c = config[kind];
  const tone = toneColors(colors)[c.tone];
  const body = message ?? c.body;

  if (kind === 'loading') {
    return (
      <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={c.title}>
        <ActivityIndicator color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted}>
          {body}
        </AppText>
      </View>
    );
  }

  // Connectivity issues are quiet banners above the content; empty/error replace it.
  if (kind === 'disconnected' || kind === 'sensorWarning') {
    return (
      <View
        style={[styles.banner, { backgroundColor: tone.bg }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Ionicons name={c.icon} size={16} color={tone.fg} style={styles.bannerIcon} />
        <View style={styles.bannerText}>
          <AppText variant="bodyStrong" color={tone.fg}>
            {c.title}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {body}
          </AppText>
          {onAction && actionLabel ? <Button label={actionLabel} onPress={onAction} variant="link" /> : null}
        </View>
      </View>
    );
  }

  // Empty inventory sits beside the status card, so it stays compact: one row, same message and action.
  if (kind === 'empty') {
    return (
      <View style={styles.compact}>
        <Ionicons name={c.icon} size={18} color={tone.fg} style={styles.bannerIcon} />
        <View style={styles.compactText}>
          <AppText variant="heading">{c.title}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {body}
          </AppText>
          {onAction && actionLabel ? (
            <View style={styles.compactAction}>
              <Button label={actionLabel} onPress={onAction} variant="primary" />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.block}
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'error' ? 'polite' : 'none'}
    >
      <Ionicons name={c.icon} size={22} color={tone.fg} />
      <AppText variant="headline">{c.title}</AppText>
      <AppText color={colors.textSecondary}>{body}</AppText>
      {onAction && actionLabel ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant={kind === 'error' ? 'primary' : 'secondary'} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    block: {
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    action: { marginTop: spacing.md },
    compact: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    compactText: { flex: 1, gap: spacing.xxs },
    compactAction: { marginTop: spacing.sm },
    banner: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
      borderRadius: radii.md,
    },
    bannerIcon: { marginTop: 2 },
    bannerText: { flex: 1, gap: spacing.xxs },
  }),
);
