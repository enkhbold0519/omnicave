import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface SettingRowProps {
  label: string;
  /** Current value in a few words. */
  value?: string;
  leading?: ReactNode;
  /** `pick` opens a list (chevron down); `open` goes to a page (chevron right). */
  kind?: 'pick' | 'open';
  onPress: () => void;
}

/** A compact settings row: label on the left, current value and a chevron on the right. */
export function SettingRow({ label, value, leading, kind = 'open', onPress }: SettingRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityHint={kind === 'pick' ? 'Opens a list to choose from' : undefined}
      scaleTo={0.985}
      style={styles.row}
      pressedStyle={styles.pressed}
    >
      <AppText variant="heading" style={styles.label}>
        {label}
      </AppText>
      {leading}
      {value ? (
        <AppText color={colors.textSecondary} numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      <Ionicons name={kind === 'pick' ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textMuted} />
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    label: { flexShrink: 0 },
    value: { flex: 1, textAlign: 'right' },
    pressed: { opacity: 0.6 },
  }),
);
