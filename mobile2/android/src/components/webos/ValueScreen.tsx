import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Section';
import type { InventoryData } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

/** Collection overview. Monetary valuation is deliberately not fabricated when no market feed is configured. */
export function ValueScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { inventory, cellars } = useActiveCellar();
  const { state } = useQuery<InventoryData>(`value|${cellars.map((c) => c.id).join(',')}`, () => inventory.listInventory('all'));
  const data = state.status === 'ready' ? state.data : null;
  const stylesCount = data ? ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'].map((style) => ({ style, count: data.bottles.filter((b) => b.status === 'in_cellar' && data.wines.find((w) => w.id === b.wineId)?.style === style).length })) : [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }]}>
      <AppText variant="display" accessibilityRole="header">Collection Value</AppText>
      {state.status === 'loading' && <AppText color={colors.textMuted}>Loading collection…</AppText>}
      {state.status === 'error' && <AppText color={colors.danger}>Could not load your collection.</AppText>}
      {data && (
        <>
          <View style={styles.hero}>
            <AppText variant="caption" color={colors.textSecondary}>COLLECTION OVERVIEW · ALL CELLARS</AppText>
            <AppText variant="display">{data.bottles.filter((b) => b.status === 'in_cellar').length} bottles</AppText>
            <AppText color={colors.textSecondary}>{new Set(data.bottles.filter((b) => b.status === 'in_cellar').map((b) => b.wineId)).size} wines across {data.cellars.length} cellars</AppText>
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Market valuation unavailable</AppText>
                <AppText variant="caption" color={colors.textSecondary}>The mobile data source does not currently include bottle prices or historical market values. No estimated monetary total is shown.</AppText>
              </View>
            </View>
          </View>
          <Section title="Bottle mix">
            <View style={styles.rows}>
              {stylesCount.map((item) => (
                <View key={item.style} style={styles.row}>
                  <AppText style={styles.flex}>{item.style}</AppText>
                  <AppText variant="bodyStrong">{item.count}</AppText>
                </View>
              ))}
            </View>
          </Section>
          <Section title="By cellar">
            <View style={styles.rows}>
              {data.cellars.map((cellar) => (
                <View key={cellar.id} style={styles.row}>
                  <AppText style={styles.flex}>{cellar.name}</AppText>
                  <AppText variant="bodyStrong">{data.bottles.filter((b) => b.cellarId === cellar.id && b.status === 'in_cellar').length}</AppText>
                </View>
              ))}
            </View>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: gutter, gap: spacing.xl },
  hero: { padding: spacing.lg, borderRadius: 18, backgroundColor: c.surface, gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
  flex: { flex: 1 },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
}));
