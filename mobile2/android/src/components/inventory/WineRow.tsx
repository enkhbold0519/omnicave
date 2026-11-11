import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import type { InventoryItem } from '@/data/inventory';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget, wineStyleTints } from '@/theme/tokens';

import { DrinkingTag } from './DrinkingTag';

interface WineRowProps {
  item: InventoryItem;
  /** Shown when browsing all cellars, e.g. "In 2 cellars". */
  cellarNote?: string;
  onPress: () => void;
}

/** Simple list layout: one hairline-separated row per wine. */
export function WineRow({ item, cellarNote, onPress }: WineRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { wine, quantity } = item;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${wine.vintage} ${wine.name}, ${wine.producer}, ${wine.region}. ${quantity} ${quantity === 1 ? 'bottle' : 'bottles'}.${cellarNote ? ` ${cellarNote}.` : ''}`}
      accessibilityHint="Opens wine details"
      scaleTo={0.985}
      style={styles.row}
      pressedStyle={styles.pressed}
    >
      <View style={[styles.bar, { backgroundColor: wineStyleTints[wine.style] }]} />
      <View style={styles.text}>
        <AppText variant="overline" color={colors.textMuted}>
          {wine.vintage} · {wine.style}
        </AppText>
        <AppText variant="heading" numberOfLines={1}>
          {wine.name}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {wine.producer} · {wine.region}
          {cellarNote ? ` · ${cellarNote}` : ''}
        </AppText>
      </View>
      <View style={styles.meta}>
        <AppText variant="title" style={styles.qty}>
          {quantity}
        </AppText>
        <DrinkingTag state={item.state} />
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: {
      minHeight: touchTarget + 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    pressed: { opacity: 0.6 },
    bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
    text: { flex: 1, gap: 2 },
    meta: { alignItems: 'flex-end', gap: spacing.xs },
    qty: { fontVariant: ['tabular-nums'] },
  }),
);
