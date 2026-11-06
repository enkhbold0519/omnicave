import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import type { DebateMessage, Persona, TagKind } from '@/data/sommelier/types';
import type { Wine } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

/** Color-coded tasting-note categories (dots only; the label text keeps theme contrast). */
export const tagColors: Record<TagKind, string> = {
  fruit: '#B5485A',
  earth: '#8A6A4A',
  structure: '#6A7A8C',
  oak: '#B08A4A',
  freshness: '#4E9A7A',
  sweetness: '#C9A04A',
};

interface Props {
  message: DebateMessage;
  persona: Persona | undefined;
  wines: Wine[];
  onOpenWine: (id: string) => void;
}

export function MessageBubble({ message, persona, wines, onOpenWine }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();

  if (message.author.kind === 'user') {
    return (
      <View style={styles.userRow} accessible accessibilityLabel={`You: ${message.text}`}>
        <View style={styles.userBubble}>
          <AppText color={colors.textOnAccent}>{message.text}</AppText>
        </View>
      </View>
    );
  }

  const name = persona?.name ?? 'Sommelier';
  const recommended = (message.wineIds ?? []).map((id) => wines.find((w) => w.id === id)).filter((w): w is Wine => !!w);
  const spoken = `${name}${message.score ? `, score ${message.score.label}` : ''}: ${message.text}${message.tags?.length ? `. Notes: ${message.tags.map((t) => t.label).join(', ')}` : ''}`;

  return (
    <View style={styles.personaRow}>
      {persona ? <PersonaAvatar persona={persona} size={32} /> : <View style={styles.avatarSpacer} />}
      <View style={styles.flex}>
        {/* Spoken once complete, so screen readers don't read every streamed word. */}
        <View accessible={!message.streaming} accessibilityLabel={message.streaming ? undefined : spoken} style={styles.bubbleWrap}>
          <View style={styles.nameRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.flexText}>
              {name}
              {persona?.title ? (
                <AppText variant="caption" color={colors.textMuted}>
                  {'  '}
                  {persona.title}
                </AppText>
              ) : null}
            </AppText>
            {message.score && !message.streaming ? (
              <View style={styles.score}>
                <AppText variant="caption" color={colors.accent}>
                  {message.score.label}
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.bubble}>
            <AppText color={colors.textPrimary}>
              {message.text}
              {message.streaming ? <AppText color={colors.textMuted}> ▍</AppText> : null}
            </AppText>
          </View>
          {message.tags?.length && !message.streaming ? (
            <View style={styles.tags}>
              {message.tags.map((t) => (
                <View key={t.label} style={styles.tag}>
                  <View style={[styles.tagDot, { backgroundColor: tagColors[t.kind] }]} />
                  <AppText variant="caption" color={colors.textSecondary}>
                    {t.label}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {!message.streaming &&
          recommended.map((w) => (
            <PressableScale
              key={w.id}
              onPress={() => onOpenWine(w.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${w.name} ${w.vintage}`}
              scaleTo={0.98}
              style={styles.wineLink}
              pressedStyle={styles.pressed}
            >
              <Ionicons name="wine-outline" size={14} color={colors.accent} />
              <AppText variant="caption" color={colors.accent} numberOfLines={1} style={styles.flexText}>
                {w.name} {w.vintage}
              </AppText>
              <Ionicons name="chevron-forward" size={12} color={colors.accent} />
            </PressableScale>
          ))}
      </View>
    </View>
  );
}

/** "Victor is thinking…" with three softly pulsing dots (static with reduced motion). */
export function TypingRow({ persona, reduceMotion }: { persona: Persona; reduceMotion: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const dot = (i: number) =>
    reduceMotion
      ? 0.6
      : pulse.interpolate({ inputRange: [0, 0.2 + i * 0.2, 0.4 + i * 0.2, 1], outputRange: [0.3, 1, 0.3, 0.3], extrapolate: 'clamp' });

  return (
    <View style={styles.personaRow} accessible accessibilityLabel={`${persona.name} is thinking`} accessibilityLiveRegion="polite">
      <PersonaAvatar persona={persona} size={32} />
      <View style={styles.typing}>
        <AppText variant="caption" color={colors.textMuted}>
          {persona.name.split(' ')[0]} is thinking
        </AppText>
        {[0, 1, 2].map((i) => (
          <Animated.View key={i} style={[styles.typingDot, { backgroundColor: colors.textMuted, opacity: dot(i) }]} />
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, gap: spacing.xs },
    flexText: { flex: 1 },
    personaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    avatarSpacer: { width: 32 },
    bubbleWrap: { gap: spacing.xs },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    score: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.accent },
    bubble: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      borderTopLeftRadius: 4,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tagDot: { width: 7, height: 7, borderRadius: 3.5 },
    wineLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: 32 },
    pressed: { opacity: 0.6 },
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingLeft: spacing.xxxl },
    userBubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      borderTopRightRadius: 4,
      backgroundColor: c.accent,
    },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
    typingDot: { width: 5, height: 5, borderRadius: 2.5 },
  }),
);
