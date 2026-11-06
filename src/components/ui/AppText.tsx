import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { typography, type TextVariant } from '@/theme/tokens';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Defaults to the theme's primary text color. */
  color?: string;
}

const maxScale: Partial<Record<TextVariant, number>> = { hero: 1.3, display: 1.4, headline: 1.5 };

/**
 * Montserrat text with token-based variants. System font scaling stays enabled;
 * large display sizes are capped so layouts remain usable at the largest settings.
 */
export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxScale[variant] ?? 2}
      {...rest}
      style={[
        typography[variant],
        { color: color ?? colors.textPrimary },
        variant === 'overline' && { textTransform: 'uppercase' },
        style,
      ]}
    />
  );
}
