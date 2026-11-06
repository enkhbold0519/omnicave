import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, spacing, touchTarget } from '@/theme/tokens';

interface HomeHeaderProps {
  unreadCount: number;
  onPressNotifications: () => void;
}

export function HomeHeader({ unreadCount, onPressNotifications }: HomeHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <View style={styles.row}>
      <AppText style={styles.wordmark} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        CellarOS
      </AppText>
      <PressableScale
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={label}
        scaleTo={0.92}
        containerStyle={styles.bellContainer}
        style={styles.bell}
        pressedStyle={styles.pressed}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <AppText style={styles.badgeText} color={colors.textOnAccent} maxFontSizeMultiplier={1}>
              {badgeText}
            </AppText>
          </View>
        )}
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    wordmark: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 22, letterSpacing: 0.3, flexShrink: 1 },
    bellContainer: { marginRight: -spacing.md },
    bell: {
      width: touchTarget,
      height: touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: touchTarget / 2,
    },
    pressed: { backgroundColor: c.surfaceMuted },
    badge: {
      position: 'absolute',
      top: 9,
      right: 8,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: c.accent,
      borderWidth: 1.5,
      borderColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontFamily: fonts.semiBold, fontSize: 9, lineHeight: 11, letterSpacing: 0 },
  }),
);
