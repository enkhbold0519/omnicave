import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { formatRelativeTime } from '@/data/derive';

import { AppText } from '@/components/ui/AppText';
import { formatTarget, zoneLabels } from '@/data/cellarLayout';
import { zoneReading, type CellarMap, type MapCell } from '@/data/cellarMap';
import type { EnvironmentReading, ZoneConfig } from '@/data/types';
import { cabinet, motion, radii, spacing, touchTarget } from '@/theme/tokens';

import { BottleEnd, EmptyRecess } from './BottleEnd';

const DOT = 28;
const RING = DOT + 10;
const easeOut = Easing.bezier(...motion.easeOut);

interface SlotGridProps {
  map: CellarMap;
  selectedSlotId: string | null;
  /** Slot found through Find Location; it pulses, then keeps its ring until the search is cleared. */
  highlightedSlotId: string | null;
  /** While searching: the matching slots stay lit and the rest dim. Null when not searching. */
  matchedSlotIds: Set<string> | null;
  /** While relocating a bottle: occupied slots dim so the free ones stand out. */
  moving: { fromSlotId: string | null } | null;
  environment: EnvironmentReading | null;
  now: Date;
  reduceMotion: boolean;
  onSelect: (cell: MapCell) => void;
  /**
   * Layout offsets so the screen can scroll a found bottle into view: `zone:<id>` is relative to the grid,
   * `shelf:<n>` relative to its zone.
   */
  onMeasure?: (key: string, y: number) => void;
}

/**
 * The cellar seen through its smoked-glass door, drawn entirely from the layout config: one rail per shelf,
 * one bottle end (or empty recess) per slot. Always dark inside, in light mode too.
 * On mount the interior light comes up and the shelves light in from the top; remount it to replay.
 */
export function SlotGrid({
  map,
  selectedSlotId,
  highlightedSlotId,
  matchedSlotIds,
  moving,
  environment,
  now,
  reduceMotion,
  onSelect,
  onMeasure,
}: SlotGridProps) {
  const [reveal] = useState(() => new Animated.Value(0));
  const shelfCount = map.zones.reduce((n, z) => n + z.shelves.length, 0);

  useEffect(() => {
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    const anim = Animated.timing(reveal, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reveal, reduceMotion]);

  // Each shelf fades from dim to lit over a window that starts a little later than the one above it.
  const span = shelfCount + 5;
  const shelfOpacity = (index: number) =>
    reveal.interpolate({ inputRange: [index / span, (index + 5) / span], outputRange: [0.12, 1], extrapolate: 'clamp' });
  const ledOpacity = reveal.interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: 'clamp' });

  const press = (cell: MapCell) => {
    Haptics.selectionAsync().catch(() => {});
    onSelect(cell);
  };

  const isDimmed = (cell: MapCell) => {
    if (moving) return cell.bottle !== null && cell.slot.id !== moving.fromSlotId;
    if (matchedSlotIds) return !matchedSlotIds.has(cell.slot.id);
    return selectedSlotId !== null && cell.slot.id !== selectedSlotId;
  };

  let shelfIndex = 0;

  return (
    <View style={styles.frame}>
      <View style={styles.interior}>
        {/* Interior LED strip along the top. */}
        <Animated.View style={[styles.led, { opacity: ledOpacity }]} pointerEvents="none">
          <LinearGradient colors={[cabinet.ledGlow, 'transparent']} style={StyleSheet.absoluteFill} />
        </Animated.View>

        {map.zones.map(({ zone, shelves, occupied, capacity }) => (
          <View
            key={zone.id}
            style={styles.zone}
            onLayout={onMeasure ? (e: LayoutChangeEvent) => onMeasure(`zone:${zone.id}`, e.nativeEvent.layout.y) : undefined}
          >
            <LinearGradient
              colors={['transparent', cabinet.zoneTints[zone.id], cabinet.zoneTints[zone.id], 'transparent']}
              locations={[0, 0.15, 0.85, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <ZoneHeader zone={zone} occupied={occupied} capacity={capacity} environment={environment} now={now} />

            {shelves.map(({ shelf, cells }) => (
              <Animated.View
                key={shelf}
                style={{ opacity: shelfOpacity(shelfIndex++) }}
                onLayout={onMeasure ? (e: LayoutChangeEvent) => onMeasure(`shelf:${shelf}`, e.nativeEvent.layout.y) : undefined}
              >
                <View style={styles.shelf}>
                  <AppText variant="caption" color={cabinet.textMuted} style={styles.shelfLabel} importantForAccessibility="no">
                    {shelf}
                  </AppText>
                  {cells.map((cell) => (
                    <Slot
                      key={cell.slot.id}
                      cell={cell}
                      selected={cell.slot.id === selectedSlotId}
                      highlighted={cell.slot.id === highlightedSlotId}
                      dimmed={isDimmed(cell)}
                      reduceMotion={reduceMotion}
                      onPress={press}
                    />
                  ))}
                </View>
                <View style={styles.rail} />
              </Animated.View>
            ))}
          </View>
        ))}

        {/* A faint diagonal reflection on the glass door. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0)']}
            locations={[0, 0.35, 0.55, 0.8]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Zone name and fill, then the configured target next to what the sensor actually reads, labelled so the two
 * are never confused. Out-of-target readings turn amber; stale ones say how old they are.
 */
function ZoneHeader({
  zone,
  occupied,
  capacity,
  environment,
  now,
}: {
  zone: ZoneConfig;
  occupied: number;
  capacity: number;
  environment: EnvironmentReading | null;
  now: Date;
}) {
  const reading = zoneReading(zone, environment, now);
  const target = `Target ${formatTarget(zone.targetC)}`;

  let actual: string;
  let actualSpoken: string;
  let color: string = cabinet.text;
  if (reading.kind === 'none') {
    actual = 'No reading';
    actualSpoken = 'no sensor reading';
    color = cabinet.textMuted;
  } else {
    const t = `${reading.temperatureC.toFixed(1)} °C`;
    const age = formatRelativeTime(reading.recordedAt, now);
    actual = reading.kind === 'live' ? `Now ${t}` : `Last ${t} · ${age}`;
    actualSpoken = reading.kind === 'live' ? `now ${t}` : `last reading ${t}, ${age}`;
    if (!reading.inRange) {
      actual += ' · outside target';
      actualSpoken += ', outside target';
      color = cabinet.caution;
    } else if (reading.kind === 'stale') {
      color = cabinet.textMuted;
    }
  }

  return (
    <View
      style={styles.zoneHeader}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${zoneLabels[zone.id]}. ${occupied} of ${capacity} slots filled. ${target}, ${actualSpoken}.`}
    >
      <View style={styles.zoneTitle}>
        <AppText variant="overline" color={cabinet.text} style={styles.flex}>
          {zoneLabels[zone.id]}
        </AppText>
        <AppText variant="caption" color={cabinet.textMuted}>
          {occupied} / {capacity}
        </AppText>
      </View>
      <View style={styles.readings}>
        <AppText variant="caption" color={cabinet.textMuted}>
          {target}
        </AppText>
        <View style={styles.readingDivider} />
        <AppText variant="caption" color={color}>
          {actual}
        </AppText>
      </View>
    </View>
  );
}

interface SlotProps {
  cell: MapCell;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  reduceMotion: boolean;
  onPress: (cell: MapCell) => void;
}

/**
 * One position. Selecting it "pulls the bottle out": it grows slightly and lifts onto a soft shadow while the
 * others dim. A found bottle sends out two pulses of light. Reduced motion keeps only the dimming and the ring.
 */
const Slot = memo(function Slot({ cell, selected, highlighted, dimmed, reduceMotion, onPress }: SlotProps) {
  const { slot, wine, uncertain } = cell;
  const [lift] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [dim] = useState(() => new Animated.Value(dimmed ? 1 : 0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(lift, {
      toValue: selected ? 1 : 0,
      duration: selected ? 240 : 160,
      easing: easeOut,
      useNativeDriver: true,
    }).start();
  }, [lift, selected]);

  useEffect(() => {
    Animated.timing(dim, { toValue: dimmed ? 1 : 0, duration: 200, easing: easeOut, useNativeDriver: true }).start();
  }, [dim, dimmed]);

  useEffect(() => {
    if (!highlighted || reduceMotion) return;
    pulse.setValue(0);
    const anim = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      { iterations: 2, resetBeforeIteration: true },
    );
    // Wait for the scroll to settle so the pulse is seen.
    const t = setTimeout(() => anim.start(), 350);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, [highlighted, pulse, reduceMotion]);

  const scale = reduceMotion ? 1 : lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const translateY = reduceMotion ? 0 : lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const opacity = dim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
  const ringed = selected || highlighted;

  const label =
    `Shelf ${slot.shelf}, position ${slot.position}, ${wine ? `${wine.name} ${wine.vintage}` : 'empty'}` +
    (uncertain ? ', position uncertain' : '');

  return (
    <Pressable
      onPress={() => onPress(cell)}
      style={styles.cell}
      accessibilityRole="button"
      accessibilityLabel={highlighted ? `${label}. Found bottle.` : label}
      accessibilityHint={wine ? 'Shows this bottle' : 'Shows this empty slot'}
      accessibilityState={{ selected }}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.slot, { opacity: pressed ? 0.7 : opacity }]}>
          {wine && !reduceMotion && (
            <Animated.View style={[styles.shadow, { opacity: lift }]} pointerEvents="none">
              <SoftShadow />
            </Animated.View>
          )}
          {highlighted && !reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                },
              ]}
            />
          )}
          <Animated.View style={[styles.ring, ringed && styles.ringOn, { transform: [{ translateY }, { scale }] }]}>
            {wine ? <BottleEnd style={wine.style} size={DOT} /> : <EmptyRecess size={DOT} />}
            {uncertain && (
              <View style={styles.uncertain} pointerEvents="none">
                <UncertainRing />
              </View>
            )}
          </Animated.View>
        </Animated.View>
      )}
    </Pressable>
  );
});

/** A dashed amber ring: "the sensors think it's here, but aren't sure". */
const UncertainRing = memo(function UncertainRing() {
  const s = RING - 3;
  return (
    <Svg width={s} height={s}>
      <Circle cx={s / 2} cy={s / 2} r={s / 2 - 1} fill="none" stroke={cabinet.caution} strokeWidth={1.5} strokeDasharray="3 3" />
    </Svg>
  );
});

const SoftShadow = memo(function SoftShadow() {
  const s = DOT + 14;
  return (
    <Svg width={s} height={s}>
      <Defs>
        <RadialGradient id="liftShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.5" stopColor="#000000" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#liftShadow)" />
    </Svg>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Bleeds slightly into the page gutter so five 48 pt slots still fit on a 320 pt-wide phone.
  frame: {
    marginHorizontal: -spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg + 8,
    backgroundColor: cabinet.frame,
    borderWidth: 1,
    borderColor: cabinet.frameEdge,
  },
  interior: {
    borderRadius: radii.lg,
    backgroundColor: cabinet.interior,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  led: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  zone: { paddingTop: spacing.sm, paddingBottom: spacing.xs, borderRadius: radii.sm },
  zoneHeader: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, gap: 2 },
  zoneTitle: { flexDirection: 'row', alignItems: 'center' },
  readings: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm },
  readingDivider: { width: 1, height: 10, backgroundColor: cabinet.frameEdge },
  shelf: { flexDirection: 'row', alignItems: 'center' },
  shelfLabel: { width: 16, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rail: {
    height: 3,
    marginLeft: 16,
    marginTop: -4,
    marginBottom: 2,
    borderRadius: 1.5,
    backgroundColor: cabinet.rail,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cabinet.railEdge,
  },
  cell: { flex: 1, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  slot: { width: RING + 8, height: RING + 8, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: cabinet.glow },
  uncertain: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', top: 6, left: (RING + 8 - (DOT + 14)) / 2, width: DOT + 14, height: DOT + 14 },
  pulse: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: cabinet.glow,
  },
});
