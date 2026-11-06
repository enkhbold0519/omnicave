import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { initials, personaColors } from '@/data/sommelier/personas';
import type { Persona } from '@/data/sommelier/types';
import { fonts } from '@/theme/tokens';

/** Initials on the persona's color. Decorative: the name is always shown or spoken next to it. */
export function PersonaAvatar({ persona, size = 36 }: { persona: Pick<Persona, 'name' | 'colorIndex'>; size?: number }) {
  const color = personaColors[persona.colorIndex] ?? personaColors[0];
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <AppText style={{ fontFamily: fonts.medium, fontSize: size * 0.38, lineHeight: size * 0.5, color: '#FFFFFF' }} maxFontSizeMultiplier={1}>
        {initials(persona.name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
