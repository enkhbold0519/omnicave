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
import { PressableScale } from '@/components/ui/PressableScale';
import type { Briefing, FeaturedWine } from '@/data/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { radii, spacing, touchTarget, wineStyleTints } from '@/theme/tokens';

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

export function FeaturedCarousel({
  featuredWine,
  briefing,
  onPressWine,
  onPressBriefing,
  reduceMotion,
  screenReader,
  intervalMs = DEFAULT_ROTATION_MS,
}: FeaturedCarouselProps) {
  const { colors } = useTheme();
  const styles = useStyles();
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
        <AppText variant="overline" color={colors.textMuted}>
          Featured
        </AppText>
        <AppText variant="heading" color={colors.textSecondary}>
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
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Show slide ${i + 1} of ${slides.length}`}
              accessibilityState={{ selected: i === index }}
              style={styles.segmentHit}
            >
              <View style={[styles.segment, i === index && styles.segmentActive]} />
            </Pressable>
          ))}
          {autoAllowed && (
            <Pressable
              onPress={() => setUserPaused((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={userPaused ? 'Resume featured rotation' : 'Pause featured rotation'}
              style={styles.pauseHit}
            >
              <Ionicons name={userPaused ? 'play' : 'pause'} size={11} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function CardFooter({ meta, action }: { meta?: string; action: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.footer}>
      <AppText variant="caption" color={colors.textMuted} style={styles.flex}>
        {meta ?? ''}
      </AppText>
      <AppText variant="bodyStrong" color={colors.accent}>
        {action}
      </AppText>
      <Ionicons name="arrow-forward" size={14} color={colors.accent} />
    </View>
  );
}

function WineSlide({ featured, position, onPress }: { featured: FeaturedWine; position: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { wine, quantity } = featured;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured wine, ${position}. ${wine.vintage} ${wine.name}, ${wine.producer}, ${wine.region}. ${quantity} in cellar.`}
      accessibilityHint="Opens wine details"
      scaleTo={0.985}
      containerStyle={styles.flex}
      style={styles.card}
      pressedStyle={styles.pressed}
    >
      <View style={styles.label}>
        <View style={[styles.swatch, { backgroundColor: wineStyleTints[wine.style] }]} />
        <AppText variant="overline" color={colors.textMuted}>
          Featured wine · {wine.vintage}
        </AppText>
      </View>
      <AppText variant="headline" numberOfLines={2}>
        {wine.name}
      </AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        {wine.producer} · {wine.region}
      </AppText>
      <AppText color={colors.textSecondary} numberOfLines={3} style={styles.note}>
        {wine.note}
      </AppText>
      <CardFooter meta={`${quantity} in cellar`} action="Details" />
    </PressableScale>
  );
}

function BriefingSlide({ briefing, position, onPress }: { briefing: Briefing; position: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Daily briefing, ${position}. ${briefing.title}. ${briefing.summary}`}
      accessibilityHint="Opens the full briefing"
      scaleTo={0.985}
      containerStyle={styles.flex}
      style={styles.card}
      pressedStyle={styles.pressed}
    >
      <View style={styles.label}>
        <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
        <AppText variant="overline" color={colors.textMuted}>
          Daily briefing
        </AppText>
      </View>
      <AppText variant="headline" numberOfLines={2}>
        {briefing.title}
      </AppText>
      <AppText color={colors.textSecondary} numberOfLines={3} style={styles.note}>
        {briefing.summary}
      </AppText>
      <CardFooter action="Read" />
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1 },
    card: {
      flex: 1,
      minHeight: 196,
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: spacing.xl,
      gap: spacing.xs,
    },
    emptyCard: { flex: 0, minHeight: 0, gap: spacing.sm },
    pressed: { backgroundColor: c.surfaceMuted },
    label: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    swatch: { width: 6, height: 6, borderRadius: 3 },
    note: { marginTop: spacing.sm },
    footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 'auto', paddingTop: spacing.lg },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
    segmentHit: { width: 36, height: touchTarget - 8, alignItems: 'center', justifyContent: 'center' },
    segment: { width: 18, height: 2, borderRadius: 1, backgroundColor: c.hairline },
    segmentActive: { width: 28, backgroundColor: c.accent },
    pauseHit: { width: touchTarget - 8, height: touchTarget - 8, alignItems: 'center', justifyContent: 'center' },
  }),
);
