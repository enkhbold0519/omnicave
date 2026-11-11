import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { DrinkingState } from '@/data/derive';
import { useTheme } from '@/theme/ThemeContext';

const labels: Record<DrinkingState, string> = { ready: 'Ready', hold: 'Hold', past: 'Past peak' };

/** Tiny dot + word for where a wine sits in its drinking window. */
export function DrinkingTag({ state }: { state: DrinkingState }) {
  const { colors } = useTheme();
  const color = state === 'ready' ? colors.success : state === 'hold' ? colors.textMuted : colors.warning;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="caption" color={state === 'hold' ? colors.textMuted : color}>
        {labels[state]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
