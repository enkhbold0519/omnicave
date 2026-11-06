import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeContext';
import { spacing } from '@/theme/tokens';

interface WelcomeSectionProps {
  name: string;
  now: Date;
  /** Condition summary; omitted while data is loading or unavailable. */
  summary?: string;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeSection({ name, now, summary }: WelcomeSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <AppText variant="display" accessibilityRole="header">
        {greeting(now)}, {name}.
      </AppText>
      {summary ? (
        <AppText color={colors.textSecondary} style={styles.summary}>
          {summary}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  summary: { marginTop: spacing.xxs },
});
