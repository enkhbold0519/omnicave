import { useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { motion } from '@/theme/tokens';

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  /** Visual style of the pressable surface. */
  style?: StyleProp<ViewStyle>;
  /** Layout style for the outer touch area (e.g. flex: 1). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra style while pressed, e.g. a background tint. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Large surfaces should scale less than small buttons. */
  scaleTo?: number;
}

const easeOut = Easing.bezier(...motion.easeOut);

/**
 * Press feedback that starts on touch-down: a subtle scale on the native thread.
 * With reduced motion the scale is dropped and only the pressed tint remains.
 */
export function PressableScale({
  children,
  style,
  containerStyle,
  pressedStyle,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { reduceMotion } = useAccessibilityPrefs();

  const animateTo = (toValue: number, duration: number) =>
    Animated.timing(scale, { toValue, duration, easing: easeOut, useNativeDriver: true }).start();

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      pressRetentionOffset={16}
      onPressIn={(e) => {
        if (!reduceMotion) animateTo(scaleTo, motion.pressInMs);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) animateTo(1, motion.pressOutMs);
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => (
        <Animated.View style={[style, pressed && pressedStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}
