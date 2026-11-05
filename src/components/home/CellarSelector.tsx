import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import type { Cellar } from '@/data/types';
import { colors, gutter, radii, spacing, touchTarget } from '@/theme/tokens';

interface CellarSelectorProps {
  cellars: Cellar[];
  activeCellar: Cellar | null;
  onSelect: (id: string) => void;
  reduceMotion: boolean;
}

export function CellarSelector({ cellars, activeCellar, onSelect, reduceMotion }: CellarSelectorProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const choose = (id: string) => {
    setOpen(false);
    if (id !== activeCellar?.id) onSelect(id);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={cellars.length === 0}
        accessibilityRole="button"
        accessibilityLabel={`Selected cellar: ${activeCellar?.name ?? 'loading'}`}
        accessibilityHint="Opens a list of cellars to switch between"
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <View style={styles.triggerText}>
          <AppText variant="caption" color={colors.textMuted}>
            Selected cellar
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {activeCellar?.name ?? 'Loading cellars…'}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.accent} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
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
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <AppText variant="heading" accessibilityRole="header" style={styles.sheetTitle}>
              Switch cellar
            </AppText>
            {cellars.map((c) => {
              const selected = c.id === activeCellar?.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => choose(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={`${c.name}, ${c.location}`}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.triggerPressed]}
                >
                  <View style={styles.triggerText}>
                    <AppText variant="bodyStrong">{c.name}</AppText>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {c.location}
                    </AppText>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.champagne,
  },
  triggerPressed: { opacity: 0.8 },
  triggerText: { flex: 1, gap: spacing.xxs },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: { marginBottom: spacing.xs },
  option: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
