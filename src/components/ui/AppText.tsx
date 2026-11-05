import { Text, type TextProps } from 'react-native';

import { colors, typography, type TextVariant } from '@/theme/tokens';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

/**
 * Montserrat text with token-based variants. System font scaling stays enabled;
 * the multiplier is capped so layouts remain usable at the largest settings.
 */
export function AppText({ variant = 'body', color = colors.textPrimary, style, ...rest }: AppTextProps) {
  const isOverline = variant === 'overline';
  return (
    <Text
      maxFontSizeMultiplier={variant === 'display' ? 1.5 : 2}
      {...rest}
      style={[typography[variant], { color }, isOverline && { textTransform: 'uppercase' }, style]}
    />
  );
}
