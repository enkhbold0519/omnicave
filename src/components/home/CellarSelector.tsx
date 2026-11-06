import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Cellar } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { spacing, touchTarget } from '@/theme/tokens';

interface CellarSelectorProps {
  cellars: Cellar[];
  activeCellar: Cellar | null;
  onSelect: (id: string) => void;
  reduceMotion: boolean;
}

export function CellarSelector({ cellars, activeCellar, onSelect, reduceMotion }: CellarSelectorProps) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const styles = useStyles();

  const choose = (id: string) => {
    setOpen(false);
    if (id !== activeCellar?.id) onSelect(id);
  };

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        disabled={cellars.length === 0}
        accessibilityRole="button"
        accessibilityLabel={`Selected cellar: ${activeCellar?.name ?? 'loading'}`}
        accessibilityHint="Opens a list of cellars to switch between"
        scaleTo={0.985}
        style={styles.trigger}
        pressedStyle={styles.pressed}
      >
        <View style={styles.flex}>
          <AppText variant="overline" color={colors.textMuted}>
            Cellar
          </AppText>
          <AppText variant="heading" numberOfLines={1}>
            {activeCellar?.name ?? 'Loading cellars…'}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.accent}>
          Change
        </AppText>
        <Ionicons name="chevron-down" size={14} color={colors.accent} />
      </PressableScale>

      <PickerSheet
        visible={open}
        title="Switch cellar"
        sections={[{ items: cellars.map((c) => ({ id: c.id, title: c.name, detail: c.location })) }]}
        selectedId={activeCellar?.id}
        reduceMotion={reduceMotion}
        onPick={choose}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, gap: spacing.xxs },
    trigger: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    pressed: { opacity: 0.6 },
  }),
);
