import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkingTag } from '@/components/inventory/DrinkingTag';
import { HomeStateView } from '@/components/home/HomeStateView';
import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { RatingDots } from '@/components/ui/RatingDots';
import { Section } from '@/components/ui/Section';
import { formatSlot } from '@/data/cellarLayout';
import { describeDrinkingWindow } from '@/data/inventory';
import type { Bottle, Cellar, WineDetails } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing, wineStyleTints } from '@/theme/tokens';

// Each Find press gets a new token so the map re-runs the search even for the same bottle.
let findToken = 0;

const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Full profile of one wine: drinking window, where each bottle is, the facts, and its opening history. */
export function WineDetailsScreen({ wineId }: { wineId: string }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const now = useNow(60_000);
  const { inventory } = useActiveCellar();
  const { state, reload } = useQuery<WineDetails | null>(`wine|${wineId}`, () => inventory.getWineDetails(wineId));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
    >
      <BackHeader />

      {state.status === 'loading' && <HomeStateView kind="loading" />}
      {state.status === 'error' && <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />}
      {state.status === 'ready' && !state.data && (
        <View style={styles.intro}>
          <AppText variant="display" accessibilityRole="header">
            Wine not found
          </AppText>
          <AppText color={colors.textSecondary}>We couldn&apos;t find a wine with the ID “{wineId}”.</AppText>
        </View>
      )}

      {state.status === 'ready' && state.data && <Details details={state.data} now={now} />}
    </ScrollView>
  );
}

function Details({ details, now }: { details: WineDetails; now: Date }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { setActiveCellarId } = useActiveCellar();

  // Find Location: make the bottle's cellar active, return to the tabs and open the map on it.
  const findLocation = (bottle: Bottle, cellar: Cellar) => {
    setActiveCellarId(cellar.id);
    router.dismissTo({ pathname: '/cellar', params: { bottleId: bottle.id, cellarId: cellar.id, t: String(++findToken) } });
  };
  const { wine, inCellar, opened } = details;
  const drinking = describeDrinkingWindow(wine, now);

  const facts: [string, string][] = [
    ['Producer', wine.producer],
    ['Region', `${wine.region}, ${wine.country}`],
    [wine.grapes.length > 1 ? 'Grapes' : 'Grape', wine.grapes.join(', ')],
    ['Vintage', String(wine.vintage)],
    ['Style', wine.style],
    ['Drinking window', `${wine.drinkFrom}–${wine.drinkUntil}`],
  ];

  return (
    <>
      <View style={styles.intro}>
        <View style={styles.overline}>
          <View style={[styles.dot, { backgroundColor: wineStyleTints[wine.style] }]} />
          <AppText variant="overline" color={colors.textMuted}>
            {wine.vintage} · {wine.style}
          </AppText>
        </View>
        <AppText variant="display" accessibilityRole="header">
          {wine.name}
        </AppText>
        <AppText color={colors.textSecondary}>
          {wine.producer} · {wine.region}, {wine.country}
        </AppText>
        <View style={styles.window} accessible accessibilityLabel={drinking.label}>
          <DrinkingTag state={drinking.state} />
          <AppText variant="caption" color={colors.textMuted}>
            {wine.drinkFrom}–{wine.drinkUntil}
          </AppText>
        </View>
        <AppText color={colors.textSecondary} style={styles.note}>
          {wine.note}
        </AppText>
        <Button
          label="Ask the sommeliers"
          variant="link"
          accessibilityHint="Starts a tasting where the sommeliers debate this wine"
          onPress={() => router.push({ pathname: '/tasting/new', params: { topic: 'wine', wineId: wine.id } })}
        />
      </View>

      <Section title={`In your cellars · ${inCellar.length}`}>
        {inCellar.length === 0 ? (
          <AppText color={colors.textMuted}>None left in your cellars.</AppText>
        ) : (
          <View style={styles.rows}>
            {inCellar.map(({ bottle, cellar, slot }) => (
              <PressableScale
                key={bottle.id}
                onPress={() => findLocation(bottle, cellar)}
                accessibilityRole="button"
                accessibilityLabel={`${cellar.name}, ${slot ? formatSlot(slot) : 'not placed in a slot'}. Added ${formatDate(bottle.addedAt)}.`}
                accessibilityHint="Find location. Opens the cellar map with this bottle highlighted."
                scaleTo={0.985}
                style={styles.row}
                pressedStyle={styles.pressed}
              >
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{cellar.name}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {slot ? formatSlot(slot) : 'Not placed'}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    Added {formatDate(bottle.addedAt)}
                  </AppText>
                </View>
                <View style={styles.find}>
                  <Ionicons name="locate-outline" size={16} color={colors.accent} />
                  <AppText variant="caption" color={colors.accent}>
                    Find
                  </AppText>
                </View>
              </PressableScale>
            ))}
          </View>
        )}
      </Section>

      <Section title="About this wine">
        <View style={styles.rows}>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
              <AppText variant="caption" color={colors.textMuted} style={styles.factLabel}>
                {label}
              </AppText>
              <AppText style={styles.flex}>{value}</AppText>
            </View>
          ))}
        </View>
      </Section>

      {opened.length > 0 && (
        <Section title="History">
          <View style={styles.rows}>
            {opened.map(({ bottle, cellar }) => (
              <View key={bottle.id} style={styles.row}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">Opened {bottle.openedAt ? formatDate(bottle.openedAt) : ''}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {cellar.name}
                  </AppText>
                </View>
                {bottle.rating ? (
                  <RatingDots rating={bottle.rating} />
                ) : (
                  <AppText variant="caption" color={colors.textMuted}>
                    Not rated
                  </AppText>
                )}
              </View>
            ))}
          </View>
        </Section>
      )}
    </>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl },
    flex: { flex: 1 },
    intro: { gap: spacing.sm },
    overline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 6, height: 6, borderRadius: 3 },
    window: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
    note: { marginTop: spacing.sm },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    factLabel: { width: 110 },
    pressed: { opacity: 0.6 },
    find: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  }),
);
