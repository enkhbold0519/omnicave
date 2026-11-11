import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStateView } from '@/components/home/HomeStateView';
import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { PressableScale } from '@/components/ui/PressableScale';
import { RatingDots } from '@/components/ui/RatingDots';
import { Segmented } from '@/components/ui/Segmented';
import { groupHistory } from '@/data/inventory';
import type { InventoryData } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing, touchTarget, wineStyleTints } from '@/theme/tokens';

type Scope = 'cellar' | 'all';

/** The collection of opened bottles, newest first, grouped by month. Opened bottles never clutter Inventory. */
export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const { inventory, activeCellar } = useActiveCellar();
  const [scope, setScope] = useState<Scope>('all');

  const scopeId = scope === 'all' ? 'all' : (activeCellar?.id ?? null);
  const { state, reload } = useQuery<InventoryData | null>(`history|${scopeId}`, () =>
    scopeId ? inventory.listHistory(scopeId) : Promise.resolve(null),
  );
  const data = state.status === 'ready' ? state.data : null;
  const sections = useMemo(
    () => (data ? groupHistory(data.bottles, data.wines, data.cellars).map((s) => ({ title: s.title, data: s.entries })) : []),
    [data],
  );
  const total = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <BackHeader label="Inventory" />
        <AppText variant="display" accessibilityRole="header">
          History
        </AppText>
        <AppText color={colors.textSecondary}>
          {data ? `${total} ${total === 1 ? 'bottle' : 'bottles'} opened` : 'Bottles you have opened'}
        </AppText>
        <Segmented<Scope>
          accessibilityLabel="Which cellars to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All cellars' },
            { value: 'cellar', label: activeCellar?.name ?? 'This cellar' },
          ]}
        />
      </View>

      {state.status === 'loading' && <HomeStateView kind="loading" />}
      {state.status === 'error' && (
        <View style={styles.pad}>
          <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />
        </View>
      )}

      {data && (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.bottle.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxxl }]}
          renderSectionHeader={({ section }) => (
            <AppText variant="overline" color={colors.textMuted} style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => {
            const opened = item.bottle.openedAt?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) ?? '';
            return (
              <PressableScale
                onPress={() => router.push({ pathname: '/wine/[id]', params: { id: item.wine.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.wine.vintage} ${item.wine.name}, opened ${opened}${item.cellar ? ` from ${item.cellar.name}` : ''}. ${item.bottle.rating ? `Rated ${item.bottle.rating} of 5.` : 'Not rated.'}`}
                accessibilityHint="Opens wine details"
                scaleTo={0.985}
                style={styles.row}
                pressedStyle={styles.pressed}
              >
                <View style={[styles.bar, { backgroundColor: wineStyleTints[item.wine.style] }]} />
                <View style={styles.flex}>
                  <AppText variant="heading" numberOfLines={1}>
                    {item.wine.name}
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {item.wine.vintage} · {opened}
                    {item.cellar ? ` · ${item.cellar.name}` : ''}
                  </AppText>
                </View>
                {item.bottle.rating ? (
                  <RatingDots rating={item.bottle.rating} />
                ) : (
                  <AppText variant="caption" color={colors.textMuted}>
                    Not rated
                  </AppText>
                )}
              </PressableScale>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText variant="heading">Nothing opened yet</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Bottles you open will gather here, with your notes and ratings.
              </AppText>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1, gap: 2 },
    header: { paddingHorizontal: gutter, gap: spacing.sm, paddingBottom: spacing.md },
    pad: { paddingHorizontal: gutter },
    list: { paddingHorizontal: gutter },
    sectionTitle: { paddingTop: spacing.xl, paddingBottom: spacing.sm },
    row: {
      minHeight: touchTarget + 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    pressed: { opacity: 0.6 },
    bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
    empty: { gap: spacing.xs, paddingVertical: spacing.xl },
  }),
);
