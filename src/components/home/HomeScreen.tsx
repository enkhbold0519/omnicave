import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeCondition, getCondition, isOutOfRange } from '@/data/derive';
import { profile } from '@/data/mockDb';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useHomeData } from '@/hooks/useHomeData';
import { useNow } from '@/hooks/useNow';
import { colors, gutter, spacing } from '@/theme/tokens';

import { CellarSelector } from './CellarSelector';
import { CellarStatusCard } from './CellarStatusCard';
import { DevScenarioPanel } from './DevScenarioPanel';
import { FeaturedCarousel } from './FeaturedCarousel';
import { HomeHeader } from './HomeHeader';
import { HomeStateView } from './HomeStateView';
import { QuickActions } from './QuickActions';
import { WelcomeSection } from './WelcomeSection';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow();
  const { reduceMotion, screenReader } = useAccessibilityPrefs();
  const { repository, cellars, activeCellar, setActiveCellarId } = useActiveCellar();
  const { state, reload } = useHomeData(repository, activeCellar?.id ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const data = state.status === 'ready' ? state.data : null;
  const condition = data ? getCondition(data.environment, now) : null;
  const summary = data && condition ? describeCondition(condition, data.environment, now) : undefined;

  const openInventory = () => router.navigate('/inventory');
  const openCellar = () => router.navigate('/cellar');
  const openAddBottle = () => router.push('/add-bottle');

  const onRefresh = () => {
    setRefreshing(true);
    reload();
    // The skeleton state takes over immediately; the spinner only needs to acknowledge the gesture.
    setTimeout(() => setRefreshing(false), 300);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <HomeHeader unreadCount={data?.unreadNotifications ?? 0} onPressNotifications={() => router.push('/notifications')} />

      <WelcomeSection name={profile.firstName} summary={summary} />

      <CellarSelector
        cellars={cellars}
        activeCellar={activeCellar}
        onSelect={setActiveCellarId}
        reduceMotion={reduceMotion}
      />

      {state.status === 'loading' && <HomeStateView kind="loading" />}

      {state.status === 'error' && (
        <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />
      )}

      {data && (
        <>
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

          <FeaturedCarousel
            key={`${data.cellar.id}:${data.featuredWine?.wine.id ?? '-'}:${data.briefing?.id ?? '-'}`}
            featuredWine={data.featuredWine}
            briefing={data.briefing}
            onPressWine={(id) => router.push({ pathname: '/wine/[id]', params: { id } })}
            onPressBriefing={(id) => router.push({ pathname: '/briefing/[id]', params: { id } })}
            reduceMotion={reduceMotion}
            screenReader={screenReader}
          />

          <QuickActions
            onFindWine={openInventory}
            onAddBottle={openAddBottle}
            onSommelier={() => router.navigate('/sommelier')}
          />
        </>
      )}

      <View style={styles.devSpacer}>
        <DevScenarioPanel />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: gutter, paddingBottom: spacing.xxl, gap: spacing.xl },
  devSpacer: { marginTop: spacing.lg },
});
