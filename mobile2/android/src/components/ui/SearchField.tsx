import Ionicons from '@expo/vector-icons/Ionicons';
import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, radii, spacing, touchTarget, typography } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  ref?: Ref<TextInputInstance>;
}

/** Search input with an icon and a clear button. */
export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, ref }: SearchFieldProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Ionicons name="search-outline" size={18} color={colors.textMuted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxFontSizeMultiplier={1.6}
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <PressableScale onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    field: {
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
  }),
);
