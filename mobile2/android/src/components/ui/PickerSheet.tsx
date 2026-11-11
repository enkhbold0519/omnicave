import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, radii, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { ChoiceRow } from './ChoiceRow';

export interface PickerItem {
  id: string;
  title: string;
  detail?: string;
  leading?: ReactNode;
}

interface PickerSheetProps {
  visible: boolean;
  title: string;
  sections: { title?: string; items: PickerItem[] }[];
  reduceMotion: boolean;
  /** Shows a checkmark on the current choice. */
  selectedId?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** A scrollable bottom sheet of choices (cellar switcher, wine and bottle pickers). */
export function PickerSheet({ visible, title, sections, reduceMotion, selectedId, onPick, onClose }: PickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: height * 0.75, paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <AppText variant="overline" color={colors.textMuted} accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
          <ScrollView contentContainerStyle={styles.list}>
            {sections
              .filter((s) => s.items.length > 0)
              .map((section, si) => (
                <View key={section.title ?? si} style={styles.section}>
                  {section.title ? (
                    <AppText variant="caption" color={colors.textMuted} accessibilityRole="header">
                      {section.title}
                    </AppText>
                  ) : null}
                  <View>
                    {section.items.map((item, i) => (
                      <ChoiceRow
                        key={item.id}
                        title={item.title}
                        detail={item.detail}
                        leading={item.leading}
                        selected={item.id === selectedId}
                        first={i === 0}
                        onPress={() => onPick(item.id)}
                      />
                    ))}
                  </View>
                </View>
              ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: gutter,
      paddingTop: spacing.sm,
    },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.hairline, marginBottom: spacing.xl },
    title: { marginBottom: spacing.md },
    list: { gap: spacing.xl, paddingBottom: spacing.md },
    section: { gap: spacing.sm },
  }),
);
