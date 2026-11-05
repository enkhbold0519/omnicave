import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { Briefing, FeaturedWine, WineStyle } from '@/data/types';
import { colors, radii, spacing, touchTarget } from '@/theme/tokens';

export const DEFAULT_ROTATION_MS = 8000;
/** Grace period after a swipe/touch ends before auto-rotation resumes. */
const RESUME_AFTER_MS = 4000;

type Slide =
  | { kind: 'wine'; key: string; item: FeaturedWine }
  | { kind: 'briefing'; key: string; item: Briefing };

interface FeaturedCarouselProps {
  featuredWine: FeaturedWine | null;
  briefing: Briefing | null;
  onPressWine: (wineId: string) => void;
  onPressBriefing: (briefingId: string) => void;
  reduceMotion: boolean;
  screenReader: boolean;
  intervalMs?: number;
}

const styleTint: Record<WineStyle, string> = {
  Red: '#6E2433',
  White: '#C9B26B',
  Rosé: '#D08C83',
  Sparkling: '#A8925A',
  Dessert: '#B9822F',
};

export function FeaturedCarousel({
  featuredWine,
  briefing,
  onPressWine,
  onPressBriefing,
  reduceMotion,
  screenReader,
  intervalMs = DEFAULT_ROTATION_MS,
}: FeaturedCarouselProps) {
  const slides: Slide[] = [];
  if (featuredWine) slides.push({ kind: 'wine', key: `wine-${featuredWine.wine.id}`, item: featuredWine });
  if (briefing) slides.push({ kind: 'briefing', key: `brief-${briefing.id}`, item: briefing });

  const scrollRef = useRef<ScrollViewInstance>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  // Auto-rotation is off entirely for reduced motion and screen readers so content never moves unexpectedly.
  const autoAllowed = slides.length > 1 && !reduceMotion && !screenReader;
  const rotating = autoAllowed && !userPaused && !interacting && focused && appActive && width > 0;

  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => {
      const next = (index + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, intervalMs);
    return () => clearTimeout(t);
  }, [rotating, index, slides.length, width, intervalMs]);

  const beginInteraction = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setInteracting(true);
  };

  const endInteraction = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteracting(false), RESUME_AFTER_MS);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: !reduceMotion });
    setIndex(i);
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  if (slides.length === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]} accessible accessibilityLabel="Nothing featured today">
        <Ionicons name="sparkles-outline" size={20} color={colors.textMuted} />
        <AppText variant="bodyStrong" color={colors.textSecondary}>
          Nothing featured today
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Add bottles to receive featured picks and daily briefings.
        </AppText>
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={slides.length > 1}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onTouchStart={beginInteraction}
        onTouchEnd={endInteraction}
        onTouchCancel={endInteraction}
        onScrollBeginDrag={beginInteraction}
        onScrollEndDrag={endInteraction}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {slides.map((slide, i) => (
          <View key={slide.key} style={{ width: width || undefined }}>
            {slide.kind === 'wine' ? (
              <WineSlide
                featured={slide.item}
                position={`${i + 1} of ${slides.length}`}
                onPress={() => onPressWine(slide.item.wine.id)}
              />
            ) : (
              <BriefingSlide
                briefing={slide.item}
                position={`${i + 1} of ${slides.length}`}
                onPress={() => onPressBriefing(slide.item.id)}
              />
            )}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.controls}>
          <View style={styles.dots}>
            {slides.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => goTo(i)}
                accessibilityRole="button"
                accessibilityLabel={`Show slide ${i + 1} of ${slides.length}`}
                accessibilityState={{ selected: i === index }}
                style={styles.dotHit}
              >
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </Pressable>
            ))}
          </View>
          {autoAllowed && (
            <Pressable
              onPress={() => setUserPaused((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={userPaused ? 'Resume featured rotation' : 'Pause featured rotation'}
              style={styles.pauseHit}
            >
              <Ionicons name={userPaused ? 'play' : 'pause'} size={14} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function WineSlide({ featured, position, onPress }: { featured: FeaturedWine; position: string; onPress: () => void }) {
  const { wine, quantity } = featured;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured wine, ${position}. ${wine.vintage} ${wine.name}, ${wine.producer}, ${wine.region}. ${quantity} in cellar.`}
      accessibilityHint="Opens wine details"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <AppText variant="overline" color={colors.accent} style={styles.flex}>
          Featured wine
        </AppText>
        <View style={[styles.swatch, { backgroundColor: styleTint[wine.style] }]} />
      </View>
      <AppText variant="title" numberOfLines={2}>
        {wine.name}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {wine.vintage} · {wine.style} · {wine.region}
      </AppText>
      <AppText color={colors.textSecondary} numberOfLines={3} style={styles.note}>
        {wine.note}
      </AppText>
      <View style={styles.cardFooter}>
        <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
          {quantity} in cellar
        </AppText>
        <AppText variant="bodyStrong" color={colors.accent}>
          Details
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
}

function BriefingSlide({ briefing, position, onPress }: { briefing: Briefing; position: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Daily briefing, ${position}. ${briefing.title}. ${briefing.summary}`}
      accessibilityHint="Opens the full briefing"
      style={({ pressed }) => [styles.card, styles.briefingCard, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <AppText variant="overline" color={colors.accent} style={styles.flex}>
          Daily briefing
        </AppText>
        <Ionicons name="newspaper-outline" size={16} color={colors.accent} />
      </View>
      <AppText variant="title" numberOfLines={2}>
        {briefing.title}
      </AppText>
      <AppText color={colors.textSecondary} numberOfLines={3} style={styles.note}>
        {briefing.summary}
      </AppText>
      <View style={styles.cardFooter}>
        <View style={styles.flex} />
        <AppText variant="bodyStrong" color={colors.accent}>
          Read briefing
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flex: 1,
    minHeight: 180,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  briefingCard: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  emptyCard: { flex: 0, minHeight: 0, alignItems: 'flex-start', gap: spacing.sm },
  pressed: { opacity: 0.85 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  note: { marginTop: spacing.xs },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 'auto', paddingTop: spacing.md },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  dots: { flexDirection: 'row' },
  dotHit: { width: 32, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.accent },
  pauseHit: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
