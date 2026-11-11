import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';

import { DrinkingTag } from '@/components/inventory/DrinkingTag';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatTarget, zoneLabels } from '@/data/cellarLayout';
import type { MapCell } from '@/data/cellarMap';
import { formatDate } from '@/data/derive';
import { describeDrinkingWindow } from '@/data/inventory';
import type { ZoneConfig } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { motion, radii, spacing, touchTarget } from '@/theme/tokens';

export interface SlotSheetActions {
  onOpenWine: (wineId: string) => void;
  onAskSommeliers: (wineId: string) => void;
  onMove: () => void;
  onOpened: () => void;
  onRemoved: () => void;
  onConfirmPosition: () => void;
  onAddHere: () => void;
  onPlaceHere: () => void;
  onClose: () => void;
}

interface SlotSheetProps extends SlotSheetActions {
  cell: MapCell;
  zone: ZoneConfig | undefined;
  now: Date;
  reduceMotion: boolean;
  busy: boolean;
  error: string | null;
  /** A one-line confirmation of the last change, e.g. "Moved here from Shelf 9, position 3". */
  flash: string | null;
  /** Bottles in this cellar without a position, offered for an empty slot. */
  unplacedCount: number;
}

/**
 * Bottom sheet for the selected position. Occupied: the bottle, its drinking state, and Move / Remove
 * (plus Confirm for an uncertain sensor position). Empty: Add a bottle here / Place an unplaced bottle.
 * Rises in once; switching slots swaps the content in place.
 */
export function SlotSheet(props: SlotSheetProps) {
  const { reduceMotion } = props;
  const styles = useStyles();
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: reduceMotion ? 120 : 220,
      easing: Easing.bezier(...motion.easeOut),
      useNativeDriver: true,
    }).start();
  }, [enter, reduceMotion]);

  const translateY = reduceMotion ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View style={[styles.card, { opacity: enter, transform: [{ translateY }] }]} accessibilityLiveRegion="polite">
      {/* Keyed by slot so a half-finished "Remove?" never carries over to another bottle. */}
      <SheetBody key={props.cell.slot.id} {...props} />
    </Animated.View>
  );
}

function SheetBody({
  cell,
  zone,
  now,
  busy,
  error,
  flash,
  unplacedCount,
  onOpenWine,
  onAskSommeliers,
  onMove,
  onOpened,
  onRemoved,
  onConfirmPosition,
  onAddHere,
  onPlaceHere,
  onClose,
}: SlotSheetProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const { slot, bottle, wine, outOfZone, uncertain } = cell;
  const place = `Shelf ${slot.shelf} · Position ${slot.position}`;

  return (
    <>
      <View style={styles.top}>
        <View style={styles.flex}>
          <AppText variant="overline" color={colors.textMuted}>
            {place} · {zoneLabels[slot.zoneId]}
          </AppText>
          {wine ? (
            <>
              <AppText variant="heading" numberOfLines={2}>
                {wine.name} {wine.vintage}
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {wine.producer} · {wine.region}
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="heading">Empty position</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {zone ? `Target ${formatTarget(zone.targetC)}` : 'No bottle here'}
              </AppText>
            </>
          )}
        </View>
        <IconButton icon="close" accessibilityLabel="Close position details" onPress={onClose} />
      </View>

      {flash ? (
        <View style={styles.flash}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <AppText variant="caption" color={colors.success} style={styles.flex}>
            {flash}
          </AppText>
        </View>
      ) : null}

      {wine && bottle ? (
        confirmingRemove ? (
          <View style={styles.block}>
            <AppText variant="bodyStrong">Take this bottle out of the cellar?</AppText>
            <View style={styles.actions}>
              <SheetAction icon="wine-outline" label="I opened it" primary disabled={busy} onPress={onOpened} />
              <SheetAction icon="exit-outline" label="Removed unopened" disabled={busy} onPress={onRemoved} />
            </View>
            <Button label="Keep it" variant="link" onPress={() => setConfirmingRemove(false)} />
          </View>
        ) : (
          <>
            <View style={styles.meta}>
              <DrinkingTag state={describeDrinkingWindow(wine, now).state} />
              <AppText variant="caption" color={colors.textMuted}>
                Added {formatDate(bottle.addedAt)}
              </AppText>
            </View>

            {uncertain && (
              <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="help-circle-outline" size={16} color={colors.warning} style={styles.noteIcon} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={colors.warning}>
                    Position uncertain
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    Placed by the sensors ({Math.round((bottle.placement?.confidence ?? 0) * 100)} % sure). It may be one position off.
                  </AppText>
                  <Button label="Confirm position" variant="link" onPress={onConfirmPosition} />
                </View>
              </View>
            )}

            {outOfZone && (
              <AppText variant="caption" color={colors.warning}>
                Stored outside the zone for {wine.style.toLowerCase()} wine.
              </AppText>
            )}

            <View style={styles.actions}>
              <SheetAction icon="swap-vertical-outline" label="Move" disabled={busy} onPress={onMove} />
              <SheetAction icon="remove-circle-outline" label="Remove" disabled={busy} onPress={() => setConfirmingRemove(true)} />
            </View>
            <View style={styles.links}>
              <Button label="View wine" variant="link" onPress={() => onOpenWine(wine.id)} />
              <Button label="Ask the sommeliers" variant="link" onPress={() => onAskSommeliers(wine.id)} />
            </View>
          </>
        )
      ) : (
        <View style={styles.actions}>
          <SheetAction icon="add" label="Add a bottle here" primary disabled={busy} onPress={onAddHere} />
          {unplacedCount > 0 && (
            <SheetAction
              icon="download-outline"
              label={`Place ${unplacedCount === 1 ? 'the unplaced bottle' : 'an unplaced bottle'}`}
              disabled={busy}
              onPress={onPlaceHere}
            />
          )}
        </View>
      )}

      {busy ? <ActivityIndicator color={colors.textMuted} style={styles.busy} accessibilityLabel="Saving" /> : null}
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fg = primary ? colors.textOnAccent : colors.accent;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      scaleTo={0.97}
      style={[styles.action, primary ? styles.actionPrimary : styles.actionQuiet, disabled && styles.disabled]}
      pressedStyle={styles.pressed}
    >
      <Ionicons name={icon} size={16} color={fg} />
      <AppText variant="bodyStrong" color={fg}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, gap: spacing.xxs },
    card: {
      gap: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
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
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', paddingRight: spacing.lg },
    flash: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingRight: spacing.lg },
    block: { gap: spacing.sm, paddingRight: spacing.lg },
    note: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: 0, borderRadius: radii.md, marginRight: spacing.md },
    noteIcon: { marginTop: 2 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingRight: spacing.md },
    action: {
      minHeight: touchTarget - 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    actionPrimary: { backgroundColor: c.accent },
    actionQuiet: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.textMuted },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },
    busy: { alignSelf: 'flex-start' },
    links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl },
  }),
);
