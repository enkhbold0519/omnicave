import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

/** Read-only 1–5 rating shown as five small dots. */
export function RatingDots({ rating }: { rating: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[
            styles.dot,
            { borderColor: colors.textMuted },
            n <= rating && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1 },
});
