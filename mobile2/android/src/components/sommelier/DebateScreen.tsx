import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { getWines, useDataVersion } from '@/data/cellarStore';
import { sommelierRepository } from '@/data/sommelier/mockSommelierRepository';
import { useSommelier } from '@/data/sommelier/sommelierStore';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useNow } from '@/hooks/useNow';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, gutter, radii, spacing, touchTarget, typography } from '@/theme/tokens';

import { MessageBubble, TypingRow } from './MessageBubble';
import { PersonaAvatar } from './PersonaAvatar';
import { VerdictCard } from './VerdictCard';

const quickReplies = {
  wine: ["Who's right?", 'Explain it simply', 'What should I eat with it?', 'When should I open it?'],
  question: ['Why that bottle?', 'Something lighter?', 'What about value?'],
};

/**
 * One tasting. Each sommelier speaks once, then the table waits: continue, join in (type, or @mention one
 * sommelier), or end with a verdict.
 */
export function DebateScreen({ debateId }: { debateId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow(60_000);
  const { colors } = useTheme();
  const styles = useStyles();
  const { reduceMotion } = useAccessibilityPrefs();
  const debate = useSommelier((s) => s.debates.find((d) => d.id === debateId));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  useDataVersion(); // re-render if wines are added
  const wines = getWines();

  if (!debate) {
    return (
      <View style={[styles.root, styles.content, { paddingTop: insets.top + spacing.sm }]}>
        <BackHeader />
        <AppText variant="display" accessibilityRole="header">
          Conversation not found
        </AppText>
        <AppText color={colors.textSecondary}>It may have been deleted.</AppText>
      </View>
    );
  }

  const persona = (id: string) => debate.participants.find((p) => p.id === id);
  const speaking = debate.speakingPersonaId ? persona(debate.speakingPersonaId) : undefined;
  const streaming = debate.messages.some((m) => m.streaming);
  const waiting = debate.status === 'awaitingUser';
  const openWine = (id: string) => router.push({ pathname: '/wine/[id]', params: { id } });

  const act = async (task: () => Promise<void>) => {
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };
  const send = (text: string) => {
    const body = text.trim();
    if (!body) return;
    setDraft('');
    void act(() => sommelierRepository.sendMessage(debate.id, body));
  };
  const mention = (name: string) => setDraft((d) => `${d.replace(/\s*$/, '')}${d.trim() ? ' ' : ''}@${name.split(' ')[0]} `);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackHeader />
        <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
          {debate.title}
        </AppText>
        <View style={styles.participants} accessible accessibilityLabel={`At the table: ${debate.participants.map((p) => p.name).join(', ')}`}>
          {debate.participants.map((p) => (
            <View key={p.id} style={[styles.participant, debate.speakingPersonaId === p.id && styles.speaking]}>
              <PersonaAvatar persona={p} size={24} />
              <AppText variant="caption" color={colors.textSecondary}>
                {p.name.split(' ')[0]}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        // Follow the conversation; jump (don't animate) while words are streaming in.
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion && !streaming })}
      >
        {debate.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            persona={m.author.kind === 'persona' ? persona(m.author.personaId) : undefined}
            wines={wines}
            onOpenWine={openWine}
          />
        ))}
        {speaking && !streaming && <TypingRow persona={speaking} reduceMotion={reduceMotion} />}
        {debate.status === 'ended' && debate.verdict && (
          <VerdictCard verdict={debate.verdict} participants={debate.participants} wines={wines} now={now} onOpenWine={openWine} />
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {error ? (
          <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        {debate.status === 'speaking' && (
          <AppText variant="caption" color={colors.textMuted} style={styles.status}>
            {speaking ? `${speaking.name.split(' ')[0]} has the floor…` : 'The table is talking…'}
          </AppText>
        )}

        {waiting && (
          <>
            <View style={styles.choices}>
              <PressableScale
                onPress={() => act(() => sommelierRepository.continueDebate(debate.id))}
                accessibilityRole="button"
                accessibilityLabel="Continue the discussion"
                scaleTo={0.97}
                style={[styles.choice, styles.choicePrimary]}
                pressedStyle={styles.pressed}
              >
                <Ionicons name="play-forward-outline" size={16} color={colors.textOnAccent} />
                <AppText variant="bodyStrong" color={colors.textOnAccent}>
                  Continue
                </AppText>
              </PressableScale>
              <PressableScale
                onPress={() => act(() => sommelierRepository.endDebate(debate.id))}
                accessibilityRole="button"
                accessibilityLabel="End the discussion and see the verdict"
                scaleTo={0.97}
                style={[styles.choice, styles.choiceQuiet]}
                pressedStyle={styles.pressed}
              >
                <Ionicons name="flag-outline" size={16} color={colors.accent} />
                <AppText variant="bodyStrong" color={colors.accent}>
                  End
                </AppText>
              </PressableScale>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
              {debate.participants.map((p) => (
                <Chip key={p.id} label={`@${p.name.split(' ')[0]}`} role="button" selected={false} onPress={() => mention(p.name)} accessibilityLabel={`Ask ${p.name} directly`} />
              ))}
              {quickReplies[debate.topic.kind].map((q) => (
                <Chip key={q} label={q} role="button" selected={false} onPress={() => send(q)} />
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Join in… (@name to ask one)"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                style={styles.input}
                multiline
                maxLength={300}
                accessibilityLabel="Your message to the table"
              />
              <IconButton icon="arrow-up-circle" accessibilityLabel="Send" onPress={() => send(draft)} />
            </View>
          </>
        )}

        {debate.status === 'ended' && (
          <View style={styles.choices}>
            <Button label="New tasting" onPress={() => router.replace({ pathname: '/tasting/new', params: { topic: debate.topic.kind === 'wine' ? 'wine' : debate.topic.intent } })} />
            <Button label="Back to Sommelier" variant="link" onPress={() => router.navigate('/sommelier')} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.md },
    flex: { flex: 1 },
    header: {
      paddingHorizontal: gutter,
      paddingBottom: spacing.md,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    participants: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    participant: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingRight: spacing.sm, paddingLeft: 2, borderRadius: radii.pill },
    speaking: { backgroundColor: c.surfaceMuted },
    messages: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 720, alignSelf: 'center' },
    composer: {
      paddingHorizontal: gutter,
      paddingTop: spacing.sm,
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.background,
    },
    status: { paddingVertical: spacing.sm },
    choices: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    choice: { minHeight: touchTarget - 4, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radii.sm },
    choicePrimary: { backgroundColor: c.accent },
    choiceQuiet: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.textMuted },
    pressed: { opacity: 0.75 },
    chips: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.xs,
      paddingLeft: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      minHeight: touchTarget,
      maxHeight: 120,
      paddingVertical: spacing.md,
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
    },
  }),
);
