import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import type { InventoryItem } from '@/data/inventory';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, wineStyleTints } from '@/theme/tokens';

import { DrinkingTag } from './DrinkingTag';

interface WineTileProps {
  item: InventoryItem;
  cellarNote?: string;
  onPress: () => void;
}

/** Compact grid layout: a small card per wine with a thin style bar on top. */
export function WineTile({ item, cellarNote, onPress }: WineTileProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { wine, quantity } = item;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${wine.vintage} ${wine.name}, ${wine.producer}. ${quantity} ${quantity === 1 ? 'bottle' : 'bottles'}.${cellarNote ? ` ${cellarNote}.` : ''}`}
      accessibilityHint="Opens wine details"
      scaleTo={0.97}
      containerStyle={styles.container}
      style={styles.tile}
      pressedStyle={styles.pressed}
    >
      <View style={[styles.bar, { backgroundColor: wineStyleTints[wine.style] }]} />
      <View style={styles.body}>
        <AppText variant="overline" color={colors.textMuted}>
          {wine.vintage}
        </AppText>
        <AppText variant="heading" numberOfLines={2} style={styles.name}>
          {wine.name}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {wine.producer}
        </AppText>
        <View style={styles.footer}>
          <DrinkingTag state={item.state} />
          <AppText variant="bodyStrong">×{quantity}</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: { flex: 1 },
    tile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      overflow: 'hidden',
    },
    pressed: { backgroundColor: c.surfaceMuted },
    bar: { height: 3 },
    body: { padding: spacing.md, gap: 2, flex: 1 },
    name: { minHeight: 42 },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: spacing.sm },
  }),
);
