import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

interface PlaceholderScreenProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Key/value details, e.g. the route param that was received. */
  details?: { label: string; value: string }[];
  /** Pushed screens show a back button; tab screens do not. */
  showBack?: boolean;
}

/** Labeled stand-in for screens that are out of scope for Phase 1. */
export function PlaceholderScreen({ title, description, icon, details, showBack }: PlaceholderScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <AppText variant="overline" color={colors.accent}>
        Placeholder · Phase 1
      </AppText>
      <AppText variant="display" accessibilityRole="header">
        {title}
      </AppText>
      <AppText color={colors.textSecondary}>{description}</AppText>

      {details?.map((d) => (
        <View key={d.label} style={styles.detail} accessible accessibilityLabel={`${d.label}: ${d.value}`}>
          <AppText variant="caption" color={colors.textMuted}>
            {d.label}
          </AppText>
          <AppText variant="bodyStrong" selectable>
            {d.value}
          </AppText>
        </View>
      ))}

      {showBack && (
        <View style={styles.back}>
          <Button
            label="Back to Home"
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: gutter, gap: spacing.md },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  detail: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  back: { marginTop: spacing.lg },
});
