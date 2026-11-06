import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { formatRelativeTime } from '@/data/derive';
import { useSommelier } from '@/data/sommelier/sommelierStore';
import { useNow } from '@/hooks/useNow';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, spacing, touchTarget } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

type StarterTopic = 'wine' | 'tonight' | 'pairing' | 'open';

const starters: { topic: StarterTopic; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  { topic: 'wine', icon: 'wine-outline', title: 'Discuss a wine', detail: 'Pick a bottle and let them debate it' },
  { topic: 'tonight', icon: 'moon-outline', title: 'What to open tonight', detail: 'Each picks a ready bottle from your cellars' },
  { topic: 'pairing', icon: 'restaurant-outline', title: 'Pair with my dinner', detail: 'Tell them what you are eating' },
  { topic: 'open', icon: 'chatbubbles-outline', title: 'Ask anything', detail: 'Any wine question, answered by the table' },
];

/** The Sommelier tab: who sits at your table, ways to start a tasting, and recent conversations. */
export function SommelierHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow(60_000);
  const { colors } = useTheme();
  const styles = useStyles();
  const personas = useSommelier((s) => s.personas);
  const debates = useSommelier((s) => s.debates);

  const start = (topic: StarterTopic) => router.push({ pathname: '/tasting/new', params: { topic } });

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.intro}>
        <AppText variant="display" accessibilityRole="header">
          Sommelier
        </AppText>
      </View>

      <Section title={`Your sommeliers · ${personas.length}`}>
        <PressableScale
          onPress={() => router.push('/sommeliers')}
          accessibilityRole="button"
          accessibilityLabel={`Your sommeliers: ${personas.map((p) => p.name).join(', ') || 'none'}. Manage.`}
          scaleTo={0.985}
          style={styles.table}
          pressedStyle={styles.pressed}
        >
          <View style={styles.avatars}>
            {personas.slice(0, 6).map((p, i) => (
              <View key={p.id} style={[styles.stack, { marginLeft: i === 0 ? 0 : -10, borderColor: colors.background }]}>
                <PersonaAvatar persona={p} size={40} />
              </View>
            ))}
            {personas.length === 0 && (
              <AppText variant="caption" color={colors.textMuted}>
                No sommeliers yet
              </AppText>
            )}
          </View>
          <AppText variant="caption" color={colors.accent}>
            Manage
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </PressableScale>
      </Section>

      <Section title="Start a tasting">
        <View style={styles.rows}>
          {starters.map((s) => (
            <PressableScale
              key={s.topic}
              onPress={() => start(s.topic)}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}. ${s.detail}`}
              scaleTo={0.985}
              style={styles.row}
              pressedStyle={styles.pressed}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={s.icon} size={18} color={colors.accent} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{s.title}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </PressableScale>
          ))}
        </View>
      </Section>

      <Section title="Recent conversations">
        {debates.length === 0 ? (
          <AppText color={colors.textMuted}>Your conversations will appear here.</AppText>
        ) : (
          <View style={styles.rows}>
            {debates.map((d) => (
              <PressableScale
                key={d.id}
                onPress={() => router.push({ pathname: '/tasting/[id]', params: { id: d.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${d.title}, with ${d.participants.map((p) => p.name).join(', ')}. ${d.status === 'ended' ? 'Ended' : 'In progress'}, ${formatRelativeTime(d.createdAt, now)}.`}
                scaleTo={0.985}
                style={styles.row}
                pressedStyle={styles.pressed}
              >
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {d.title}
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {d.participants.map((p) => p.name.split(' ')[0]).join(', ')} · {d.status === 'ended' ? 'Ended' : 'In progress'} ·{' '}
                    {formatRelativeTime(d.createdAt, now)}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </PressableScale>
            ))}
          </View>
        )}
      </Section>

      {personas.length < 2 && (
        <Button label="Add sommeliers to start a tasting" variant="secondary" onPress={() => router.push('/sommeliers')} />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, paddingBottom: spacing.xxxl, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    intro: { gap: spacing.sm },
    flex: { flex: 1, gap: spacing.xxs },
    table: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    avatars: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stack: { borderWidth: 2, borderRadius: 22 },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
    pressed: { opacity: 0.6 },
  }),
);
