import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Section } from '@/components/ui/Section';
import { getCondition, homeSummary, isOutOfRange } from '@/data/derive';
import { profile } from '@/data/mockDb';
import type { HomeSnapshot } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useNow } from '@/hooks/useNow';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing } from '@/theme/tokens';

import { CellarSelector } from './CellarSelector';
import { CellarStatusCard } from './CellarStatusCard';
import { FeaturedCarousel } from './FeaturedCarousel';
import { HomeHeader } from './HomeHeader';
import { HomeStateView } from './HomeStateView';
import { QuickActions } from './QuickActions';
import { WelcomeSection } from './WelcomeSection';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow();
  const { colors } = useTheme();
  const styles = useStyles();
  const { reduceMotion, screenReader } = useAccessibilityPrefs();
  const { repository, cellars, activeCellar, setActiveCellarId } = useActiveCellar();
  const cellarId = activeCellar?.id ?? null;
  const { state, reload } = useQuery<HomeSnapshot | null>(`home|${cellarId}`, () =>
    cellarId ? repository.getHomeSnapshot(cellarId) : Promise.resolve(null),
  );
  const [refreshing, setRefreshing] = useState(false);

  const data = state.status === 'ready' ? state.data : null;
  const condition = data ? getCondition(data.environment, now) : null;
  const summary = data && condition ? homeSummary(condition, data.bottleCount) : undefined;

  const openInventory = () => router.navigate('/inventory');
  // A fresh value each time so Inventory focuses its search field even on repeat visits.
  const findWine = () => router.navigate({ pathname: '/inventory', params: { focus: String(Date.now()) } });
  const openCellar = () => router.navigate('/cellar');
  const openAddBottle = () => router.push('/add-bottle');

  const onRefresh = () => {
    setRefreshing(true);
    reload();
    // The loading state takes over immediately; the spinner only needs to acknowledge the gesture.
    setTimeout(() => setRefreshing(false), 300);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} colors={[colors.accent]} />
      }
    >
      {/* Header and greeting sit close together so more of the cellar is visible without scrolling. */}
      <View style={styles.top}>
        <HomeHeader unreadCount={data?.unreadNotifications ?? 0} onPressNotifications={() => router.push('/notifications')} />
        <View style={styles.intro}>
          <WelcomeSection name={profile.firstName} now={now} summary={summary} />
          <CellarSelector
            cellars={cellars}
            activeCellar={activeCellar}
            onSelect={setActiveCellarId}
            reduceMotion={reduceMotion}
          />
        </View>
      </View>

      {(state.status === 'loading' || !activeCellar) && <HomeStateView kind="loading" />}

      {state.status === 'error' && (
        <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />
      )}

      {data && (
        <>
          <View style={styles.status}>
            {condition === 'disconnected' && (
              <HomeStateView
                kind="disconnected"
                message={`${data.environment.sensorMessage ?? 'The sensor hub is offline'}. Readings below may be out of date.`}
                actionLabel="Retry connection"
                onAction={reload}
              />
            )}
            {condition !== 'disconnected' && (data.environment.sensor === 'warning' || isOutOfRange(data.environment)) && (
              <HomeStateView
                kind="sensorWarning"
                message={data.environment.sensorMessage}
                actionLabel="View cellar"
                onAction={openCellar}
              />
            )}

            <CellarStatusCard
              environment={data.environment}
              bottleCount={data.bottleCount}
              now={now}
              onPressStatus={openCellar}
              onPressBottles={openInventory}
            />

            {data.bottleCount === 0 && (
              <HomeStateView kind="empty" actionLabel="Add your first bottle" onAction={openAddBottle} />
            )}
          </View>

          <Section title="Today">
            <FeaturedCarousel
              key={`${data.cellar.id}:${data.featuredWine?.wine.id ?? '-'}:${data.briefing?.id ?? '-'}`}
              featuredWine={data.featuredWine}
              briefing={data.briefing}
              onPressWine={(id) => router.push({ pathname: '/wine/[id]', params: { id } })}
              onPressBriefing={(id) => router.push({ pathname: '/briefing/[id]', params: { id } })}
              reduceMotion={reduceMotion}
              screenReader={screenReader}
            />
          </Section>

          <Section title="Shortcuts">
            <QuickActions
              onFindWine={findWine}
              onAddBottle={openAddBottle}
              onSommelier={() => router.navigate('/sommelier')}
            />
          </Section>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, paddingBottom: spacing.xxxl, gap: spacing.xxxl },
    top: { gap: spacing.sm },
    intro: { gap: spacing.xl },
    status: { gap: spacing.md },
  }),
);
