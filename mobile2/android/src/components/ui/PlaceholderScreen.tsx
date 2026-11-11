import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

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
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <View style={styles.intro}>
        <Ionicons
          name={icon}
          size={22}
          color={colors.accent}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <AppText variant="overline" color={colors.textMuted}>
          Placeholder · Phase 1
        </AppText>
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
        <AppText color={colors.textSecondary}>{description}</AppText>
      </View>

      {details && details.length > 0 && (
        <View style={styles.details}>
          {details.map((d) => (
            <View key={d.label} style={styles.detail} accessible accessibilityLabel={`${d.label}: ${d.value}`}>
              <AppText variant="overline" color={colors.textMuted}>
                {d.label}
              </AppText>
              <AppText variant="bodyStrong" selectable>
                {d.value}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {showBack && (
        <Button
          label="Back to Home"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl },
    intro: { gap: spacing.sm },
    details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    detail: {
      paddingVertical: spacing.lg,
      gap: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
  }),
);
