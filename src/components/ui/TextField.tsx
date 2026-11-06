import { StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, radii, spacing, touchTarget, typography } from '@/theme/tokens';

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
}

/** Single-line form input in the app's hairline style. */
export function TextField({ value, onChange, placeholder, label, maxLength, keyboardType }: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.accent}
      style={styles.field}
      maxLength={maxLength}
      keyboardType={keyboardType}
      accessibilityLabel={label}
    />
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    field: {
      minHeight: touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
    },
  }),
);
