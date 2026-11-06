import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { sommelierRepository } from '@/data/sommelier/mockSommelierRepository';
import { focusLabels, loveLabels, personaColors, scaleLabels, strictnessLabels, toneLabels } from '@/data/sommelier/personas';
import { useSommelier } from '@/data/sommelier/sommelierStore';
import type { Love, PersonaInput, PersonaTraits, RegionFocus, ScoringScale, Strictness, Tone } from '@/data/sommelier/types';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, gutter, radii, spacing, touchTarget, typography } from '@/theme/tokens';

import { PersonaAvatar } from './PersonaAvatar';

const MAX_DESCRIPTION = 400;

const blank: PersonaInput = {
  name: '',
  title: '',
  colorIndex: 3,
  traits: { scoring: 'hundred', focus: 'everywhere', loves: ['fruit'], strictness: 3, tone: 'warm', description: '' },
};

/** Create or edit a sommelier: name, look, personality and what they've learned about you. */
export function PersonaEditorScreen({ personaId }: { personaId?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const existing = useSommelier((s) => (personaId ? s.personas.find((p) => p.id === personaId) : undefined));

  const [form, setForm] = useState<PersonaInput>(() =>
    existing ? { name: existing.name, title: existing.title, colorIndex: existing.colorIndex, traits: { ...existing.traits, loves: [...existing.traits.loves] } } : blank,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (personaId && !existing) {
    return (
      <View style={[styles.root, styles.content, { paddingTop: insets.top + spacing.sm }]}>
        <BackHeader />
        <AppText variant="display" accessibilityRole="header">
          Sommelier not found
        </AppText>
      </View>
    );
  }

  const setTrait = <K extends keyof PersonaTraits>(key: K, value: PersonaTraits[K]) => setForm((f) => ({ ...f, traits: { ...f.traits, [key]: value } }));
  const toggleLove = (l: Love) => {
    const loves = form.traits.loves;
    if (loves.includes(l)) setTrait('loves', loves.filter((x) => x !== l));
    else if (loves.length < 3) setTrait('loves', [...loves, l]);
  };

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => (personaId ? sommelierRepository.updatePersona(personaId, form) : sommelierRepository.createPersona(form)));
  const canSave = form.name.trim().length > 0 && form.traits.loves.length > 0 && !busy;

  return (
    <ScrollView
      style={styles.root}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
    >
      <BackHeader />
      <View style={styles.preview}>
        <PersonaAvatar persona={{ name: form.name || '?', colorIndex: form.colorIndex }} size={64} />
        <View style={styles.flex}>
          <AppText variant="display" accessibilityRole="header" numberOfLines={1}>
            {personaId ? 'Edit sommelier' : 'New sommelier'}
          </AppText>
          <AppText color={colors.textSecondary} numberOfLines={1}>
            {form.name.trim() || 'Unnamed'}
            {form.title.trim() ? ` · ${form.title.trim()}` : ''}
          </AppText>
        </View>
      </View>

      <Section title="Name">
        <TextField value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} placeholder="e.g. Inês Duarte" label="Name" maxLength={40} />
        <TextField value={form.title} onChange={(title) => setForm((f) => ({ ...f, title }))} placeholder="Role, e.g. The Explorer" label="Role" maxLength={40} />
      </Section>

      <Section title="Avatar color">
        <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Avatar color">
          {personaColors.map((color, i) => {
            const selected = form.colorIndex === i;
            return (
              <Pressable
                key={color}
                onPress={() => setForm((f) => ({ ...f, colorIndex: i }))}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Color ${i + 1}`}
                style={[styles.swatchHit, selected && { borderColor: colors.textPrimary }]}
              >
                <View style={[styles.swatch, { backgroundColor: color }]} />
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={`What they value · ${form.traits.loves.length} of 3`}>
        <ChipGroup label="What they value">
          {(Object.keys(loveLabels) as Love[]).map((l) => (
            <Chip key={l} label={loveLabels[l]} role="checkbox" selected={form.traits.loves.includes(l)} onPress={() => toggleLove(l)} />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Scoring">
        <Segmented<ScoringScale>
          accessibilityLabel="Scoring scale"
          value={form.traits.scoring}
          onChange={(v) => setTrait('scoring', v)}
          options={(Object.keys(scaleLabels) as ScoringScale[]).map((v) => ({ value: v, label: scaleLabels[v] }))}
        />
      </Section>

      <Section title="Region focus">
        <Segmented<RegionFocus>
          accessibilityLabel="Region focus"
          value={form.traits.focus}
          onChange={(v) => setTrait('focus', v)}
          options={(Object.keys(focusLabels) as RegionFocus[]).map((v) => ({ value: v, label: focusLabels[v] }))}
        />
      </Section>

      <Section title="How strict">
        <ChipGroup label="How strict">
          {([1, 2, 3, 4, 5] as Strictness[]).map((v) => (
            <Chip key={v} label={strictnessLabels[v]} selected={form.traits.strictness === v} onPress={() => setTrait('strictness', v)} />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Tone">
        <ChipGroup label="Tone">
          {(Object.keys(toneLabels) as Tone[]).map((v) => (
            <Chip key={v} label={toneLabels[v]} selected={form.traits.tone === v} onPress={() => setTrait('tone', v)} />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Personality">
        <TextInput
          value={form.traits.description}
          onChangeText={(t) => setTrait('description', t)}
          placeholder="Describe them in your own words: background, favourite regions, pet hates…"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[styles.field, styles.multiline]}
          multiline
          maxLength={MAX_DESCRIPTION}
          accessibilityLabel="Personality description"
        />
        <AppText variant="caption" color={colors.textMuted}>
          {form.traits.description.length}/{MAX_DESCRIPTION} · With the live AI, this becomes part of how they think and speak.
        </AppText>
      </Section>

      {existing && (
        <Section title="What they remember about you">
          {existing.memory.length === 0 ? (
            <AppText color={colors.textMuted}>Nothing yet. Tell them what you like during a tasting.</AppText>
          ) : (
            <>
              {existing.memory.map((m) => (
                <AppText key={m} color={colors.textSecondary}>
                  • {m}
                </AppText>
              ))}
              <Button label="Clear memory" variant="link" onPress={() => void sommelierRepository.clearPersonaMemory(existing.id)} />
            </>
          )}
        </Section>
      )}

      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={personaId ? 'Save changes' : 'Add sommelier'}
          accessibilityState={{ disabled: !canSave }}
          style={({ pressed }) => [styles.save, !canSave && styles.disabled, pressed && styles.savePressed]}
        >
          <AppText variant="bodyStrong" color={colors.textOnAccent}>
            {personaId ? 'Save changes' : 'Add sommelier'}
          </AppText>
        </Pressable>

        {existing &&
          (confirmDelete ? (
            <View style={styles.confirm}>
              <AppText variant="bodyStrong">Delete {existing.name}?</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Past conversations keep their messages.{existing.builtIn ? ' You can restore default sommeliers later.' : ''}
              </AppText>
              <View style={styles.confirmRow}>
                <Button label="Delete" variant="secondary" onPress={() => run(() => sommelierRepository.deletePersona(existing.id))} />
                <Button label="Keep" variant="link" onPress={() => setConfirmDelete(false)} />
              </View>
            </View>
          ) : (
            <Button label="Delete sommelier" variant="link" onPress={() => setConfirmDelete(true)} />
          ))}
      </View>
    </ScrollView>
  );
}


function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.chips} accessibilityLabel={label}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    flex: { flex: 1, gap: spacing.xxs },
    preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    field: {
      minHeight: touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
    },
    multiline: { minHeight: 110, paddingVertical: spacing.md, textAlignVertical: 'top' },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    swatchHit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    swatch: { width: 32, height: 32, borderRadius: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    actions: { gap: spacing.md },
    save: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: c.accent },
    savePressed: { backgroundColor: c.accentPressed },
    disabled: { opacity: 0.45 },
    confirm: { gap: spacing.xs },
    confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  }),
);
