import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStateView } from '@/components/home/HomeStateView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { summarizeOccupancy } from '@/data/cellarMap';
import {
  filterInventory,
  groupInventory,
  sortInventory,
  sortLabels,
  type InventoryItem,
  type SortKey,
  type StyleFilter,
} from '@/data/inventory';
import type { CellarMapData, InventoryData } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, gutter, radii, spacing, touchTarget, typography } from '@/theme/tokens';

import { WineRow } from './WineRow';
import { WineTile } from './WineTile';

const styleFilters: { value: StyleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Red', label: 'Red' },
  { value: 'White', label: 'White' },
  { value: 'Rosé', label: 'Rosé' },
  { value: 'Sparkling', label: 'Sparkling' },
  { value: 'Dessert', label: 'Dessert' },
];
const sortOrder: SortKey[] = ['name', 'vintage', 'recent'];

type Layout = 'list' | 'grid';
type Scope = 'cellar' | 'all';

export function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useStyles();
  const now = useNow(60_000);
  const { inventory, activeCellar, cellars } = useActiveCellar();
  const params = useLocalSearchParams<{ focus?: string }>();
  const inputRef = useRef<TextInputInstance>(null);

  const [scope, setScope] = useState<Scope>('cellar');
  const [layout, setLayout] = useState<Layout>('list');
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState<StyleFilter>('all');
  const [readyOnly, setReadyOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');

  const scopeId = scope === 'all' ? 'all' : (activeCellar?.id ?? null);
  const { state, reload } = useQuery<InventoryData | null>(`inventory|${scopeId}`, () =>
    scopeId ? inventory.listInventory(scopeId) : Promise.resolve(null),
  );

  // Slot usage comes from the same calculation as the Cellar Map, so the two always agree.
  const occupancyQuery = useQuery<CellarMapData | null>(`occupancy|${activeCellar?.id ?? null}`, () =>
    activeCellar ? inventory.getCellarMap(activeCellar.id) : Promise.resolve(null),
  );
  const occupancy =
    occupancyQuery.state.status === 'ready' && occupancyQuery.state.data ? summarizeOccupancy(occupancyQuery.state.data) : null;

  // "Find Wine" on Home passes a fresh `focus` value so the search field is ready to type.
  useEffect(() => {
    if (!params.focus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [params.focus]);

  const data = state.status === 'ready' ? state.data : null;
  const items = useMemo(() => (data ? groupInventory(data.bottles, data.wines, now) : []), [data, now]);
  const visible = useMemo(
    () => sortInventory(filterInventory(items, { query, style, readyOnly }), sort),
    [items, query, style, readyOnly, sort],
  );
  const filtering = query.trim() !== '' || style !== 'all' || readyOnly;
  const columns = width >= 600 ? 3 : 2;
  // Pad the last grid row with spacers so a lone tile keeps its column width.
  const listData: (InventoryItem | null)[] =
    layout === 'grid' && visible.length % columns !== 0
      ? [...visible, ...Array<null>(columns - (visible.length % columns)).fill(null)]
      : visible;

  const clearFilters = () => {
    setQuery('');
    setStyle('all');
    setReadyOnly(false);
  };

  const cellarNote = (item: InventoryItem) => {
    if (scope !== 'all') return undefined;
    if (item.cellarIds.length > 1) return `In ${item.cellarIds.length} cellars`;
    return cellars.find((c) => c.id === item.cellarIds[0])?.name;
  };

  const openWine = (id: string) => router.push({ pathname: '/wine/[id]', params: { id } });

  const summary = (() => {
    if (!data) return '';
    const bottles = data.bottles.length;
    const base = `${bottles} ${bottles === 1 ? 'bottle' : 'bottles'} · ${items.length} ${items.length === 1 ? 'wine' : 'wines'}`;
    if (filtering) return `Showing ${visible.length} of ${items.length} wines`;
    if (scope === 'all') return `${base} across ${cellars.length} cellars`;
    return occupancy ? `${base} · ${occupancy.occupied} of ${occupancy.capacity} slots` : base;
  })();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="display" accessibilityRole="header" style={styles.flex}>
            Inventory
          </AppText>
          <IconButton icon="time-outline" accessibilityLabel="History of opened bottles" onPress={() => router.push('/history')} />
          <IconButton
            icon={layout === 'list' ? 'grid-outline' : 'list-outline'}
            accessibilityLabel={layout === 'list' ? 'Show as grid' : 'Show as list'}
            onPress={() => setLayout((l) => (l === 'list' ? 'grid' : 'list'))}
          />
        </View>

        <Segmented<Scope>
          accessibilityLabel="Which cellars to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'cellar', label: activeCellar?.name ?? 'This cellar' },
            { value: 'all', label: 'All cellars' },
          ]}
        />

        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Wine, winery, region, vintage, grape"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            maxFontSizeMultiplier={1.6}
            accessibilityLabel="Search inventory"
          />
          {query ? (
            <PressableScale onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </PressableScale>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <View style={styles.chipGroup} accessibilityRole="radiogroup" accessibilityLabel="Style">
            {styleFilters.map((f) => (
              <Chip key={f.value} label={f.label} selected={style === f.value} onPress={() => setStyle(f.value)} />
            ))}
          </View>
          <View style={styles.divider} />
          <Chip label="Ready to drink" role="checkbox" selected={readyOnly} onPress={() => setReadyOnly((r) => !r)} />
          <Chip
            label={`Sort: ${sortLabels[sort]}`}
            role="button"
            selected={false}
            accessibilityLabel={`Sort by ${sortLabels[sort]}. Tap to change.`}
            onPress={() => setSort((s) => sortOrder[(sortOrder.indexOf(s) + 1) % sortOrder.length])}
          />
        </ScrollView>
      </View>

      {state.status === 'loading' && <HomeStateView kind="loading" />}
      {state.status === 'error' && (
        <View style={styles.statePad}>
          <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />
        </View>
      )}

      {data && (
        <FlatList
          key={layout}
          data={listData}
          keyExtractor={(i, index) => i?.wine.id ?? `spacer-${index}`}
          numColumns={layout === 'grid' ? columns : 1}
          columnWrapperStyle={layout === 'grid' ? styles.gridRow : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <AppText variant="caption" color={colors.textMuted} style={styles.summary}>
              {summary}
            </AppText>
          }
          renderItem={({ item }) =>
            !item ? (
              <View style={styles.flex} />
            ) : layout === 'grid' ? (
              <WineTile item={item} cellarNote={cellarNote(item)} onPress={() => openWine(item.wine.id)} />
            ) : (
              <WineRow item={item} cellarNote={cellarNote(item)} onPress={() => openWine(item.wine.id)} />
            )
          }
          ListEmptyComponent={
            data.bottles.length === 0 ? (
              <HomeStateView kind="empty" actionLabel="Add your first bottle" onAction={() => router.push('/add-bottle')} />
            ) : (
              <View style={styles.noMatch}>
                <AppText variant="heading">No wines match</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  Try another word, or clear the filters.
                </AppText>
                <Button label="Clear filters" variant="link" onPress={clearFilters} />
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    header: { paddingHorizontal: gutter, gap: spacing.md, paddingBottom: spacing.xs },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginRight: -spacing.md },
    search: {
      minHeight: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      minHeight: touchTarget,
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
      paddingVertical: 0,
    },
    clear: { width: 36, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
    chips: { gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xs, paddingRight: gutter },
    chipGroup: { flexDirection: 'row', gap: spacing.sm },
    divider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: c.hairline, marginHorizontal: spacing.xs },
    list: { paddingHorizontal: gutter, paddingBottom: spacing.xxxl },
    gridRow: { gap: spacing.md, marginBottom: spacing.md },
    summary: { paddingTop: spacing.sm, paddingBottom: spacing.md },
    noMatch: { alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.xl },
    statePad: { paddingHorizontal: gutter, paddingTop: spacing.lg },
  }),
);
