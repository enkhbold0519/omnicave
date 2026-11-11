import { StyleSheet } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** "radio" for one-of-many groups, "checkbox" for independent toggles. */
  role?: 'radio' | 'checkbox' | 'button';
}

/** Small filter pill: hairline outline, filled with the accent when selected. */
export function Chip({ label, selected, onPress, accessibilityLabel, role = 'radio' }: ChipProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? undefined : { checked: selected, selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 6, bottom: 6 }}
      scaleTo={0.95}
      style={[styles.chip, selected && styles.selected]}
      pressedStyle={styles.pressed}
    >
      <AppText variant="caption" color={selected ? colors.textOnAccent : colors.textSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    // 36px visual; hitSlop extends the touch area to 48px.
    chip: {
      minHeight: 36,
      minWidth: touchTarget - 8,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.textMuted,
    },
    selected: { backgroundColor: c.accent, borderColor: c.accent },
    pressed: { opacity: 0.7 },
  }),
);
