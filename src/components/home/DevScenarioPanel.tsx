import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { devScenarios, setDevScenario, useDevScenario } from '@/data/devScenario';
import { colors, radii, spacing, touchTarget } from '@/theme/tokens';

/** Development-only controls for simulating failure states. Not rendered in production builds. */
export function DevScenarioPanel() {
  const scenario = useDevScenario();
  if (!__DEV__) return null;

  return (
    <View style={styles.root}>
      <AppText variant="overline" color={colors.textMuted}>
        Developer · simulate scenario
      </AppText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {devScenarios.map((s) => {
          const selected = s.value === scenario;
          return (
            <Pressable
              key={s.value}
              onPress={() => setDevScenario(s.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`Simulate ${s.label}`}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <AppText variant="caption" color={selected ? colors.textOnAccent : colors.textSecondary}>
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
});
