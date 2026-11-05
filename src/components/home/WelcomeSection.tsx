import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/theme/tokens';

interface WelcomeSectionProps {
  name: string;
  /** Condition summary; omitted while data is loading or unavailable. */
  summary?: string;
}

export function WelcomeSection({ name, summary }: WelcomeSectionProps) {
  return (
    <View style={styles.root}>
      <AppText variant="overline" color={colors.accent}>
        Your collection, considered
      </AppText>
      <AppText variant="display" accessibilityRole="header">
        Welcome, {name}.
      </AppText>
      {summary ? <AppText color={colors.textSecondary}>{summary}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
});
