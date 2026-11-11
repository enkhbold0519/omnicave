import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { touchTarget } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/** A 48×48 round icon-only button. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress }: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      scaleTo={0.92}
      style={styles.button}
      pressedStyle={styles.pressed}
    >
      <Ionicons name={icon} size={21} color={colors.textPrimary} />
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    button: {
      width: touchTarget,
      height: touchTarget,
      borderRadius: touchTarget / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { backgroundColor: c.surfaceMuted },
  }),
);
