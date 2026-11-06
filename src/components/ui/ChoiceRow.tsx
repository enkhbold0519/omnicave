import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface ChoiceRowProps {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  /** Draws the top hairline; set on the first row of a group. */
  first?: boolean;
  /** Optional visual before the text, e.g. a color swatch. */
  leading?: ReactNode;
}

/** One option in a single-choice list: hairline-separated, checkmark when selected. */
export function ChoiceRow({ title, detail, selected, onPress, first, leading }: ChoiceRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      scaleTo={0.985}
      style={[styles.row, first && styles.first]}
      pressedStyle={styles.pressed}
    >
      {leading}
      <View style={styles.text}>
        <AppText variant="heading" color={selected ? colors.accent : colors.textPrimary}>
          {title}
        </AppText>
        {detail ? (
          <AppText variant="caption" color={colors.textMuted}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: {
      minHeight: touchTarget + 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    first: { borderTopWidth: StyleSheet.hairlineWidth },
    text: { flex: 1, gap: spacing.xxs },
    pressed: { opacity: 0.6 },
  }),
);
