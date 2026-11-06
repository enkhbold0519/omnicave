import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { devScenarios, setDevScenario, useDevScenario } from '@/data/devScenario';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, touchTarget } from '@/theme/tokens';

/** Development-only controls for simulating Home failure states. Not rendered in production builds. */
export function DevScenarioPanel() {
  const scenario = useDevScenario();
  const { colors } = useTheme();
  const styles = useStyles();
  if (!__DEV__) return null;

  return (
    <View style={styles.root}>
      <AppText variant="caption" color={colors.textMuted}>
        Simulates states on Home. Visible in development builds only.
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
              <AppText variant="caption" color={selected ? colors.background : colors.textSecondary}>
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { gap: spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: touchTarget,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    chipSelected: { backgroundColor: c.textSecondary, borderColor: c.textSecondary },
  }),
);
