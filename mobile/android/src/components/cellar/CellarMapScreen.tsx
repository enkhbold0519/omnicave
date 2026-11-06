import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CellarSelector } from '@/components/home/CellarSelector';
import { HomeStateView } from '@/components/home/HomeStateView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { formatSlot, zoneForStyle } from '@/data/cellarLayout';
import {
  allCells,
  buildCellarMap,
  locateBottle,
  searchMap,
  type BottleLocation,
  type CellarMap,
  type MapCell,
} from '@/data/cellarMap';
import { getDataVersion } from '@/data/cellarStore';
import type { CellarMapData, WineStyle } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { cabinet, gutter, radii, spacing } from '@/theme/tokens';

import { BottleEnd, EmptyRecess } from './BottleEnd';
import { MapSearch } from './MapSearch';
import { PickerSheet, type PickerItem } from '@/components/ui/PickerSheet';
import { SlotGrid } from './SlotGrid';
import { SlotSheet } from './SlotSheet';

/** Route params set by Find Location on Wine Details. `t` makes a repeat search for the same bottle fire again. */
type FindParams = { bottleId?: string; cellarId?: string; t?: string };

/** A bottle being relocated: the next tap on a free position moves it there. */
interface Moving {
  bottleId: string;
  /** Null when placing a bottle that has no position yet. */
  fromSlotId: string | null;
  title: string;
  fromLabel: string | null;
}

type Picker = { kind: 'add' | 'place'; slotId: string } | null;

const styleOrder: WineStyle[] = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'];
/** Wide screens (tablets, landscape) keep the cabinet at a comfortable, centred width. */
const MAX_WIDTH = 640;

export function CellarMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow(60_000);
  const { colors } = useTheme();
  const styles = useStyles();
  const { reduceMotion } = useAccessibilityPrefs();
  const { inventory, cellars, activeCellar, setActiveCellarId } = useActiveCellar();
  const params = useLocalSearchParams<FindParams>();
  const activeId = activeCellar?.id ?? null;

  const { state, reload, loadedVersion } = useQuery<CellarMapData | null>(`cellarMap|${activeId}`, () =>
    activeId ? inventory.getCellarMap(activeId) : Promise.resolve(null),
  );

  const data = state.status === 'ready' ? state.data : null;
  const layout = data?.layout ?? null;
  const map = useMemo<CellarMap | null>(
    () => (data && data.layout ? buildCellarMap({ ...data, layout: data.layout }) : null),
    [data],
  );

  // ── Search ───────────────────────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [step, setStep] = useState({ query: '', index: 0 });
  const searching = query.trim() !== '';
  const search = useMemo(() => (map ? searchMap(map, query) : { cells: [], unplaced: [] }), [map, query]);
  const matchCount = search.cells.length;
  const rawIndex = step.query === query ? step.index : 0;
  const matchIndex = matchCount ? ((rawIndex % matchCount) + matchCount) % matchCount : 0;
  const currentMatch = searching ? (search.cells[matchIndex] ?? null) : null;
  const matchedSlotIds = useMemo(() => (searching ? new Set(search.cells.map((c) => c.slot.id)) : null), [searching, search]);

  // ── Find Location (from Wine Details); a search takes precedence ─────────────────────────────
  const findBottleId = !searching && params.bottleId && params.cellarId === activeId ? params.bottleId : null;
  const found: BottleLocation | null = map && findBottleId ? locateBottle(map, findBottleId) : null;
  const foundCell = found?.kind === 'placed' ? found.cell : null;
  const clearFind = () =>
    router.setParams({
      bottleId: undefined,
      cellarId: undefined,
      t: undefined,
    });

  // ── Selection, moving and changes ────────────────────────────────────────────────────────────
  // Selection belongs to a context; switching cellar, a new Find or a new query resets it.
  const context = `${activeId}|${params.t ?? ''}|${query}`;
  const [selection, setSelection] = useState<{
    context: string;
    slotId: string | null;
  } | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [moveHint, setMoveHint] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    slotId: string;
    flash?: string;
    error?: string;
  } | null>(null);
  // After a change, wait until the map has reloaded at that data version before showing the result.
  const [awaitVersion, setAwaitVersion] = useState<number | null>(null);
  const syncing = awaitVersion !== null && (loadedVersion ?? -1) < awaitVersion;

  const selectedSlotId = moving
    ? null
    : selection?.context === context
      ? selection.slotId
      : searching
        ? null
        : (foundCell?.slot.id ?? null);
  const selectedCell = map && selectedSlotId ? (allCells(map).find((c) => c.slot.id === selectedSlotId) ?? null) : null;
  const slotFeedback = feedback && feedback.slotId === selectedSlotId ? feedback : null;

  const select = (slotId: string | null) => {
    setSelection({ context, slotId });
    setFeedback(null);
  };

  /** Runs a change, then selects `slotId` with a confirmation (or the error) once the map shows it. */
  const change = async (slotId: string, task: () => Promise<unknown>, flash: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await task();
      setAwaitVersion(getDataVersion());
      setSelection({ context, slotId });
      setFeedback({ slotId, flash });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return true;
    } catch (err) {
      setFeedback({
        slotId,
        error: err instanceof Error ? err.message : 'Something went wrong.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSlotPress = async (cell: MapCell) => {
    if (!moving) {
      select(cell.slot.id);
      return;
    }
    if (cell.bottle?.id === moving.bottleId) {
      setMoving(null); // tapping the bottle being moved cancels
      return;
    }
    if (cell.bottle) {
      setMoveHint('That position is taken. Choose a free one.');
      return;
    }
    const from = moving.fromLabel;
    setMoveHint(null);
    const ok = await change(
      cell.slot.id,
      () => inventory.moveBottle(moving.bottleId, cell.slot.id),
      from ? `Moved here from ${from}.` : 'Placed here.',
    );
    if (ok) setMoving(null);
    else setMoveHint("Couldn't move the bottle. Check your connection and try again.");
  };

  const startMove = (cell: MapCell) => {
    if (!cell.bottle || !cell.wine) return;
    setMoving({
      bottleId: cell.bottle.id,
      fromSlotId: cell.slot.id,
      title: `${cell.wine.name} ${cell.wine.vintage}`,
      fromLabel: `Shelf ${cell.slot.shelf}, position ${cell.slot.position}`,
    });
    setMoveHint(null);
    setFeedback(null);
  };

  const selectCellar = (id: string) => {
    setActiveCellarId(id);
    setMoving(null);
    setQuery('');
    if (params.bottleId) clearFind();
  };
  const openWine = (id: string) => router.push({ pathname: '/wine/[id]', params: { id } });

  // ── Pickers for an empty position ────────────────────────────────────────────────────────────
  const pickerSlot = map && picker ? allCells(map).find((c) => c.slot.id === picker.slotId) : undefined;
  const pickerSections = useMemo((): {
    title?: string;
    items: PickerItem[];
  }[] => {
    if (!data || !picker || !pickerSlot) return [];
    if (picker.kind === 'place') {
      return [
        {
          items: (map?.unplaced ?? []).map(({ bottle, wine }) => ({
            id: bottle.id,
            title: wine ? `${wine.name} ${wine.vintage}` : 'Unknown wine',
            detail: wine ? `${wine.style} · ${wine.producer}` : undefined,
            leading: wine ? <BottleEnd style={wine.style} size={18} /> : undefined,
          })),
        },
      ];
    }
    const toItem = (w: (typeof data.wines)[number]): PickerItem => ({
      id: w.id,
      title: `${w.name} ${w.vintage}`,
      detail: `${w.style} · ${w.producer}`,
      leading: <BottleEnd style={w.style} size={18} />,
    });
    const byName = [...data.wines].sort((a, b) => a.name.localeCompare(b.name));
    const zone = pickerSlot.slot.zoneId;
    return [
      {
        title: 'Suited to this zone',
        items: byName.filter((w) => zoneForStyle(w.style) === zone).map(toItem),
      },
      {
        title: 'Other wines',
        items: byName.filter((w) => zoneForStyle(w.style) !== zone).map(toItem),
      },
    ];
  }, [data, map, picker, pickerSlot]);

  const onPick = (id: string) => {
    if (!picker || !activeId) return;
    const { kind, slotId } = picker;
    setPicker(null);
    if (kind === 'add') void change(slotId, () => inventory.addBottle({ cellarId: activeId, wineId: id, slotId }), 'Added here.');
    else void change(slotId, () => inventory.moveBottle(id, slotId), 'Placed here.');
  };

  // ── Scroll the focused bottle (search match or found bottle) into view ───────────────────────
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Record<string, number>>({});
  const focusCell = currentMatch ?? foundCell;
  const focusShelf = focusCell?.slot.shelf;
  const focusZone = focusCell?.slot.zoneId;
  const fromFind = !currentMatch && !!foundCell;
  useEffect(() => {
    if (!focusShelf || !focusZone) return;
    const t = setTimeout(() => {
      if (fromFind) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const o = offsets.current;
      const y = (o.grid ?? 0) + (o[`zone:${focusZone}`] ?? 0) + (o[`shelf:${focusShelf}`] ?? 0);
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 160),
        animated: !reduceMotion,
      });
    }, 120);
    return () => clearTimeout(t);
  }, [focusShelf, focusZone, fromFind, params.t, matchIndex, query, reduceMotion]);

  const styleCounts = useMemo(() => {
    const counts = new Map<WineStyle, number>();
    if (map) for (const c of allCells(map)) if (c.wine) counts.set(c.wine.style, (counts.get(c.wine.style) ?? 0) + 1);
    return counts;
  }, [map]);

  const docked = moving || selectedCell;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: docked ? 300 : spacing.xxxl,
          },
        ]}
      >
        <View style={styles.header}>
          <AppText variant="display" accessibilityRole="header">
            Cellar
          </AppText>
          <CellarSelector cellars={cellars} activeCellar={activeCellar} onSelect={selectCellar} reduceMotion={reduceMotion} />
        </View>

        {(!activeCellar || state.status === 'loading') && <HomeStateView kind="loading" message="Loading the cellar map…" />}

        {state.status === 'error' && (
          <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />
        )}

        {state.status === 'ready' && activeCellar && !data && (
          <Notice icon="help-circle-outline" title="Cellar not found" body="This cellar is no longer on your account." />
        )}

        {data && !layout && (
          <Notice
            icon="grid-outline"
            title="Layout unavailable"
            body="We don't have a storage layout for this cellar's model yet, so its map can't be drawn. Your bottles are still listed in Inventory."
            actionLabel="Open Inventory"
            onAction={() => router.navigate('/inventory')}
          />
        )}

        {map && data && (
          <>
            <View style={styles.summary}>
              <AppText color={colors.textSecondary}>
                {map.occupied} of {map.capacity} filled
              </AppText>
              <Legend counts={styleCounts} uncertain={map.uncertainCount > 0} />
            </View>

            <MapSearch
              query={query}
              onChangeQuery={(q) => {
                setQuery(q);
                if (q && params.bottleId) clearFind();
              }}
              total={matchCount}
              index={matchIndex}
              unplacedMatches={search.unplaced.length}
              onStep={(d) => setStep({ query, index: matchIndex + d })}
            />

            {found && <FindResult location={found} cellarName={data.cellar.name} onClear={clearFind} />}

            {map.occupied === 0 && map.unplaced.length === 0 && (
              <HomeStateView kind="empty" message="Tap any position below to add a bottle there." />
            )}

            <View onLayout={(e) => (offsets.current.grid = e.nativeEvent.layout.y)}>
              <SlotGrid
                // Remounting per cellar replays the "light coming on" reveal when you switch.
                key={data.cellar.id}
                map={map}
                environment={data.environment}
                now={now}
                reduceMotion={reduceMotion}
                selectedSlotId={selectedSlotId}
                highlightedSlotId={moving ? moving.fromSlotId : (focusCell?.slot.id ?? null)}
                matchedSlotIds={matchedSlotIds}
                moving={moving ? { fromSlotId: moving.fromSlotId } : null}
                onSelect={onSlotPress}
                onMeasure={(key, y) => (offsets.current[key] = y)}
              />
            </View>

            {map.unplaced.length > 0 && (
              <Section title={`Not placed · ${map.unplaced.length}`}>
                <View style={styles.rows}>
                  {map.unplaced.map(({ bottle, wine }) => (
                    <View key={bottle.id} style={styles.row}>
                      <PressableScale
                        onPress={wine ? () => openWine(wine.id) : undefined}
                        disabled={!wine}
                        accessibilityRole="button"
                        accessibilityLabel={`${wine ? `${wine.name} ${wine.vintage}` : 'Unknown wine'}, no position recorded`}
                        scaleTo={0.985}
                        containerStyle={styles.flex}
                        style={styles.rowText}
                        pressedStyle={styles.pressed}
                      >
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {wine ? `${wine.name} ${wine.vintage}` : 'Unknown wine'}
                        </AppText>
                      </PressableScale>
                      <Button
                        label="Place"
                        variant="secondary"
                        accessibilityHint="Then tap a free position on the map"
                        onPress={() => {
                          setMoving({
                            bottleId: bottle.id,
                            fromSlotId: null,
                            title: wine ? `${wine.name} ${wine.vintage}` : 'this bottle',
                            fromLabel: null,
                          });
                          setMoveHint(null);
                          scrollRef.current?.scrollTo({
                            y: Math.max(0, (offsets.current.grid ?? 0) - 120),
                            animated: !reduceMotion,
                          });
                        }}
                      />
                    </View>
                  ))}
                </View>
              </Section>
            )}
          </>
        )}
      </ScrollView>

      {moving ? (
        <View style={styles.dock} pointerEvents="box-none">
          <View style={styles.dockInner}>
            <MoveBar moving={moving} hint={moveHint} busy={busy} onCancel={() => setMoving(null)} />
          </View>
        </View>
      ) : selectedCell && map ? (
        <View style={styles.dock} pointerEvents="box-none">
          <View style={styles.dockInner}>
            <SlotSheet
              cell={selectedCell}
              zone={map.layout.zones.find((z) => z.id === selectedCell.slot.zoneId)}
              now={now}
              reduceMotion={reduceMotion}
              busy={busy || syncing}
              error={slotFeedback?.error ?? null}
              flash={syncing ? null : (slotFeedback?.flash ?? null)}
              unplacedCount={map.unplaced.length}
              onOpenWine={openWine}
              onAskSommeliers={(wineId) => router.push({ pathname: '/tasting/new', params: { topic: 'wine', wineId } })}
              onClose={() => select(null)}
              onMove={() => startMove(selectedCell)}
              onOpened={() =>
                selectedCell.bottle &&
                void change(
                  selectedCell.slot.id,
                  () => inventory.openBottle(selectedCell.bottle!.id),
                  'Opened. It’s now in History.',
                )
              }
              onRemoved={() =>
                selectedCell.bottle &&
                void change(
                  selectedCell.slot.id,
                  () => inventory.removeBottle(selectedCell.bottle!.id),
                  'Removed from the cellar.',
                )
              }
              onConfirmPosition={() =>
                selectedCell.bottle &&
                void change(selectedCell.slot.id, () => inventory.confirmPosition(selectedCell.bottle!.id), 'Position confirmed.')
              }
              onAddHere={() => setPicker({ kind: 'add', slotId: selectedCell.slot.id })}
              onPlaceHere={() => setPicker({ kind: 'place', slotId: selectedCell.slot.id })}
            />
          </View>
        </View>
      ) : null}

      <PickerSheet
        visible={picker !== null}
        title={
          pickerSlot
            ? `${picker?.kind === 'add' ? 'Add to' : 'Place in'} shelf ${pickerSlot.slot.shelf}, position ${pickerSlot.slot.position}`
            : ''
        }
        sections={pickerSections}
        reduceMotion={reduceMotion}
        onPick={onPick}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function Legend({ counts, uncertain }: { counts: Map<WineStyle, number>; uncertain: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const present = styleOrder.filter((s) => counts.has(s));
  const spoken = [...present, 'Empty', ...(uncertain ? ['Dashed ring: position uncertain'] : [])];
  return (
    <View style={styles.legend} accessibilityLabel={`Key: ${spoken.join(', ')}`} accessible>
      {present.map((s) => (
        <View key={s} style={styles.legendItem}>
          <BottleEnd style={s} size={12} />
          <AppText variant="caption" color={colors.textMuted}>
            {s}
          </AppText>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={styles.legendRecess}>
          <EmptyRecess size={12} />
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          Empty
        </AppText>
      </View>
      {uncertain && (
        <View style={styles.legendItem}>
          <View style={styles.legendUncertain} />
          <AppText variant="caption" color={colors.textMuted}>
            Uncertain
          </AppText>
        </View>
      )}
    </View>
  );
}

function MoveBar({ moving, hint, busy, onCancel }: { moving: Moving; hint: string | null; busy: boolean; onCancel: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.moveBar} accessibilityLiveRegion="polite">
      <Ionicons name="swap-vertical-outline" size={18} color={colors.accent} style={styles.noticeIcon} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {moving.fromSlotId ? 'Moving' : 'Placing'} {moving.title}
        </AppText>
        <AppText variant="caption" color={hint ? colors.warning : colors.textSecondary}>
          {busy ? 'Saving…' : (hint ?? 'Tap a free position on the map.')}
        </AppText>
      </View>
      <Button label="Cancel" variant="link" onPress={onCancel} />
    </View>
  );
}

function FindResult({ location, cellarName, onClear }: { location: BottleLocation; cellarName: string; onClear: () => void }) {
  if (location.kind === 'placed') {
    const { wine, slot, uncertain } = location.cell;
    return (
      <Notice
        icon="locate-outline"
        title={wine ? `${wine.name} ${wine.vintage}` : 'Bottle found'}
        body={formatSlot(slot) + (uncertain ? ' · position uncertain' : '')}
        actionLabel="Clear"
        onAction={onClear}
      />
    );
  }
  const body =
    location.kind === 'unplaced'
      ? `${location.entry.wine?.name ?? 'This bottle'} is in ${cellarName}, but it hasn't been given a position yet.`
      : `This bottle is no longer in ${cellarName}.`;
  return (
    <Notice
      icon="help-circle-outline"
      tone="warning"
      title="Location unavailable"
      body={body}
      actionLabel="Dismiss"
      onAction={onClear}
    />
  );
}

/** A quiet inline message for map-specific states. */
function Notice({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'warning';
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fg = tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: tone === 'warning' ? colors.warningSoft : colors.surface,
          paddingBottom: actionLabel ? spacing.xs : spacing.lg,
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={icon} size={18} color={fg} style={styles.noticeIcon} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={tone === 'warning' ? fg : colors.textPrimary}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {body}
        </AppText>
        {actionLabel && onAction ? <Button label={actionLabel} variant="link" onPress={onAction} /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: {
      paddingHorizontal: gutter,
      gap: spacing.xxl,
      width: '100%',
      maxWidth: MAX_WIDTH,
      alignSelf: 'center',
    },
    flex: { flex: 1, gap: spacing.xxs },
    header: { gap: spacing.xl },
    summary: { gap: spacing.sm },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: spacing.lg,
      rowGap: spacing.xs,
      marginTop: spacing.xs,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // The empty recess and dashed ring are drawn for the dark interior; give them a dark backing on the page.
    legendRecess: { borderRadius: 6, backgroundColor: cabinet.interior },
    legendUncertain: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: cabinet.caution,
      backgroundColor: cabinet.interior,
    },
    notice: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    noticeIcon: { marginTop: 2 },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    rowText: { gap: spacing.xxs, paddingVertical: spacing.xs },
    pressed: { opacity: 0.6 },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.md,
      alignItems: 'center',
    },
    dockInner: {
      width: '100%',
      maxWidth: MAX_WIDTH,
      paddingHorizontal: gutter - spacing.sm,
    },
    moveBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  }),
);
