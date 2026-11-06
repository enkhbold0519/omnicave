import { StyleSheet, TextInput, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, radii, spacing, touchTarget, typography } from '@/theme/tokens';

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  /** Hidden input (passwords). */
  secure?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
}

/** Single-line form input in the app's hairline style. */
export function TextField({ value, onChange, placeholder, label, maxLength, keyboardType, secure, autoComplete }: TextFieldProps) {
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
      secureTextEntry={secure}
      autoComplete={autoComplete}
      autoCapitalize={secure || keyboardType === 'email-address' ? 'none' : undefined}
      autoCorrect={secure || keyboardType === 'email-address' ? false : undefined}
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
