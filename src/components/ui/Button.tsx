import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', accessibilityHint }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
      ]}
    >
      <AppText variant="bodyStrong" color={primary ? colors.textOnAccent : colors.accent}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  primary: { backgroundColor: colors.accent },
  primaryPressed: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryPressed: { backgroundColor: colors.surfaceMuted },
});
