import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts, spacing, touchTarget } from '@/theme/tokens';

interface HomeHeaderProps {
  unreadCount: number;
  onPressNotifications: () => void;
}

export function HomeHeader({ unreadCount, onPressNotifications }: HomeHeaderProps) {
  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <View style={styles.row}>
      <AppText variant="title" style={styles.wordmark} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        CellarOS
      </AppText>
      <Pressable
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={4}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
      >
        <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <AppText variant="caption" color={colors.textOnAccent} style={styles.badgeText} maxFontSizeMultiplier={1.2}>
              {badgeText}
            </AppText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  wordmark: { fontFamily: fonts.semiBold, letterSpacing: 0.2, flexShrink: 1 },
  bell: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: touchTarget / 2,
    marginRight: -spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  badge: {
    position: 'absolute',
    top: 8,
    right: 7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, fontFamily: fonts.semiBold },
});
