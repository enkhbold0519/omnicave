import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

/** Back control for pushed screens; falls back to Home when there's nothing to go back to. */
export function BackHeader({ label = 'Back' }: { label?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel={label}
        scaleTo={0.94}
        style={styles.hit}
        pressedStyle={styles.pressed}
      >
        <Ionicons name="chevron-back" size={20} color={colors.accent} />
        <AppText variant="bodyStrong" color={colors.accent}>
          {label}
        </AppText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  hit: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingRight: spacing.md, marginLeft: -6 },
  pressed: { opacity: 0.6 },
});
