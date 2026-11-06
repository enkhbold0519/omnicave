import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary: solid accent · secondary: hairline outline · link: text with arrow. */
  variant?: 'primary' | 'secondary' | 'link';
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const textColor = variant === 'primary' ? colors.textOnAccent : colors.accent;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      containerStyle={styles.container}
      style={[styles.base, styles[variant]]}
      pressedStyle={variant === 'primary' ? styles.primaryPressed : styles.quietPressed}
    >
      <AppText variant="bodyStrong" color={textColor}>
        {label}
      </AppText>
      {variant === 'link' && <Ionicons name="arrow-forward" size={14} color={colors.accent} />}
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: { alignSelf: 'flex-start' },
    base: {
      minHeight: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radii.sm,
    },
    primary: { backgroundColor: c.accent, paddingHorizontal: spacing.xl },
    secondary: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.textMuted, paddingHorizontal: spacing.xl },
    link: { paddingHorizontal: 0 },
    primaryPressed: { backgroundColor: c.accentPressed },
    quietPressed: { opacity: 0.7 },
  }),
);
