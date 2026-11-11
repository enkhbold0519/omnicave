import { Pressable, StyleSheet, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Two or three mutually exclusive options in one hairline track. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={o.label}
            style={styles.hit}
          >
            <View style={[styles.segment, selected && styles.selected]}>
              <AppText variant="caption" color={selected ? colors.textPrimary : colors.textMuted} numberOfLines={1}>
                {o.label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: 3,
      backgroundColor: c.surfaceMuted,
    },
    hit: { flex: 1, minHeight: touchTarget - 8 },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
    selected: { backgroundColor: c.surface },
  }),
);
