import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts, radii, spacing, touchTarget } from '@/theme/tokens';

interface QuickActionsProps {
  onFindWine: () => void;
  onAddBottle: () => void;
  onSommelier: () => void;
}

export function QuickActions({ onFindWine, onAddBottle, onSommelier }: QuickActionsProps) {
  const actions: { label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    { label: 'Find Wine', hint: 'Opens your inventory', icon: 'search-outline', onPress: onFindWine },
    { label: 'Add Bottle', hint: 'Opens bottle registration', icon: 'add-circle-outline', onPress: onAddBottle },
    { label: 'Sommelier', hint: 'Opens the AI sommelier', icon: 'sparkles-outline', onPress: onSommelier },
  ];

  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name={a.icon} size={22} color={colors.accent} />
          <AppText variant="caption" style={styles.label} numberOfLines={2}>
            {a.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: touchTarget + 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  label: { fontFamily: fonts.semiBold, color: colors.accent, textAlign: 'center' },
});
