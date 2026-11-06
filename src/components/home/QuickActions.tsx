import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget } from '@/theme/tokens';

interface QuickActionsProps {
  onFindWine: () => void;
  onAddBottle: () => void;
  onSommelier: () => void;
}

/** Quiet, editorial list of shortcuts separated by hairlines rather than boxed tiles. */
export function QuickActions({ onFindWine, onAddBottle, onSommelier }: QuickActionsProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const actions: { label: string; detail: string; hint: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    { label: 'Find Wine', detail: 'Search your collection', hint: 'Opens your inventory', icon: 'search-outline', onPress: onFindWine },
    { label: 'Add Bottle', detail: 'Register a new bottle', hint: 'Opens bottle registration', icon: 'add-outline', onPress: onAddBottle },
    { label: 'Sommelier', detail: 'Pairings and drinking windows', hint: 'Opens the AI sommelier', icon: 'sparkles-outline', onPress: onSommelier },
  ];

  return (
    <View style={styles.list}>
      {actions.map((a) => (
        <PressableScale
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          scaleTo={0.985}
          style={styles.row}
          pressedStyle={styles.pressed}
        >
          <Ionicons name={a.icon} size={18} color={colors.accent} />
          <View style={styles.text}>
            <AppText variant="heading">{a.label}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {a.detail}
            </AppText>
          </View>
          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
        </PressableScale>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    list: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      minHeight: touchTarget + 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    text: { flex: 1, gap: spacing.xxs },
    pressed: { opacity: 0.6 },
  }),
);
