import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { sommelierRepository } from '@/data/sommelier/mockSommelierRepository';
import { builtInPersonas, loveLabels, scaleLabels } from '@/data/sommelier/personas';
import { useSommelier } from '@/data/sommelier/sommelierStore';
import { TABLE_MAX, TABLE_MIN } from '@/data/sommelier/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing, touchTarget } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

/** Everyone who can sit at your table. Add sommeliers to match your taste; edit or delete any of them. */
export function PersonaListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const personas = useSommelier((s) => s.personas);
  const missingDefaults = builtInPersonas.some((b) => !personas.some((p) => p.id === b.id));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
    >
      <BackHeader />
      <View style={styles.intro}>
        <AppText variant="display" accessibilityRole="header">
          Sommeliers
        </AppText>
        <AppText color={colors.textSecondary}>
          Add sommeliers that match your taste. Any {TABLE_MIN} to {TABLE_MAX} of them can sit at a tasting.
        </AppText>
      </View>

      <View style={styles.rows}>
        {personas.map((p) => (
          <PressableScale
            key={p.id}
            onPress={() => router.push({ pathname: '/sommeliers/edit', params: { id: p.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${p.title}. ${scaleLabels[p.traits.scoring]}, values ${p.traits.loves.map((l) => loveLabels[l]).join(', ')}. Edit.`}
            scaleTo={0.985}
            style={styles.row}
            pressedStyle={styles.pressed}
          >
            <PersonaAvatar persona={p} size={44} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{p.name}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {p.title}
                {p.builtIn ? ' · Default' : ''}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                {scaleLabels[p.traits.scoring]} · {p.traits.loves.map((l) => loveLabels[l]).join(', ')}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
        ))}
        {personas.length === 0 && (
          <AppText color={colors.textMuted} style={styles.empty}>
            No sommeliers yet. Add at least {TABLE_MIN} to start a tasting.
          </AppText>
        )}
      </View>

      <View style={styles.actions}>
        <Button label="Add a sommelier" onPress={() => router.push('/sommeliers/edit')} />
        {missingDefaults && <Button label="Restore default sommeliers" variant="link" onPress={() => void sommelierRepository.restoreDefaultPersonas()} />}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    intro: { gap: spacing.sm },
    flex: { flex: 1, gap: 2 },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      minHeight: touchTarget + 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    empty: { paddingVertical: spacing.lg },
    actions: { gap: spacing.sm },
    pressed: { opacity: 0.6 },
  }),
);
