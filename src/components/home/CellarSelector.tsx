import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ChoiceRow } from '@/components/ui/ChoiceRow';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Cellar } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, radii, spacing, touchTarget } from '@/theme/tokens';

interface CellarSelectorProps {
  cellars: Cellar[];
  activeCellar: Cellar | null;
  onSelect: (id: string) => void;
  reduceMotion: boolean;
}

export function CellarSelector({ cellars, activeCellar, onSelect, reduceMotion }: CellarSelectorProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
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

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'fade' : 'slide'}
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close cellar list"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <AppText variant="overline" color={colors.textMuted} accessibilityRole="header" style={styles.sheetTitle}>
              Switch cellar
            </AppText>
            {cellars.map((c, i) => (
              <ChoiceRow
                key={c.id}
                title={c.name}
                detail={c.location}
                selected={c.id === activeCellar?.id}
                onPress={() => choose(c.id)}
                first={i === 0}
              />
            ))}
          </View>
        </View>
      </Modal>
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
    modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: gutter,
      paddingTop: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.hairline,
      marginBottom: spacing.xl,
    },
    sheetTitle: { marginBottom: spacing.md },
  }),
);
