import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStateView } from '@/components/home/HomeStateView';
import { AppText } from '@/components/ui/AppText';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { formatSlot, zoneForStyle, zoneLabels } from '@/data/cellarLayout';
import { allCells, buildCellarMap } from '@/data/cellarMap';
import type { CellarMapData, DetectedBottle, NewBottleInput, WineDetails, WineStyle } from '@/data/types';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { useQuery } from '@/hooks/useQuery';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { gutter, radii, spacing, touchTarget } from '@/theme/tokens';

const styles: WineStyle[] = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'];

interface FormValues {
  name: string;
  producer: string;
  vintage: string;
  style: WineStyle;
  grapes: string;
  region: string;
  country: string;
  cellarId: string | null;
  /** Undefined: use the suggested position. */
  slotId?: string | null;
}

interface BottleFormProps {
  title: string;
  submitLabel: string;
  initial: FormValues;
  /** When editing, the bottle's own position counts as free. */
  ownBottleId?: string;
  /** Shown under the wine fields. */
  note?: string;
  onSubmit: (input: NewBottleInput) => Promise<void>;
  /** Extra actions under the submit button (Remove, Not a bottle). */
  footer?: ReactNode;
}

const emptyForm: FormValues = { name: '', producer: '', vintage: '', style: 'Red', grapes: '', region: '', country: '', cellarId: null };

/** The bottle form shared by Add and Edit: the wine's details and where it goes, with a suggested free position. */
function BottleForm({ title, submitLabel, initial, ownBottleId, note, onSubmit, footer }: BottleFormProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const { reduceMotion } = useAccessibilityPrefs();
  const { inventory, cellars, activeCellar } = useActiveCellar();

  const [name, setName] = useState(initial.name);
  const [producer, setProducer] = useState(initial.producer);
  const [vintage, setVintage] = useState(initial.vintage);
  const [style, setStyle] = useState<WineStyle>(initial.style);
  const [grapes, setGrapes] = useState(initial.grapes);
  const [region, setRegion] = useState(initial.region);
  const [country, setCountry] = useState(initial.country);
  const [cellarId, setCellarId] = useState<string | null>(initial.cellarId);
  // A position the user picked for a given cellar; otherwise the suggestion is used.
  const [picked, setPicked] = useState<{ cellarId: string; slotId: string | null } | null>(
    initial.cellarId && initial.slotId !== undefined ? { cellarId: initial.cellarId, slotId: initial.slotId } : null,
  );
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetCellarId = cellarId ?? activeCellar?.id ?? null;
  const { state } = useQuery<CellarMapData | null>(`bottleForm|${targetCellarId}`, () =>
    targetCellarId ? inventory.getCellarMap(targetCellarId) : Promise.resolve(null),
  );
  const free = useMemo(() => {
    const data = state.status === 'ready' ? state.data : null;
    return data?.layout ? allCells(buildCellarMap({ ...data, layout: data.layout })).filter((c) => !c.bottle || c.bottle.id === ownBottleId).map((c) => c.slot) : [];
  }, [state, ownBottleId]);

  // Suggest the first free position in the zone for this style, else any free position.
  const suggested = free.find((slot) => slot.zoneId === zoneForStyle(style)) ?? free[0] ?? null;
  const userPick = picked && picked.cellarId === targetCellarId ? picked : null;
  const slotId = userPick ? userPick.slotId : (suggested?.id ?? null);
  const slot = free.find((x) => x.id === slotId) ?? null;

  const year = new Date().getFullYear();
  const vintageNo = Number(vintage);
  const valid =
    name.trim() && producer.trim() && region.trim() && country.trim() && grapes.trim() && Number.isInteger(vintageNo) && vintageNo >= 1900 && vintageNo <= year;

  const save = async () => {
    if (!targetCellarId) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        cellarId: targetCellarId,
        slotId: slot?.id ?? null,
        wine: { name, producer, vintage: vintageNo, style, region, country, grapes: grapes.split(',') },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView
        style={s.root}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <BackHeader />
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>

        <Section title="Wine">
          <TextField label="Wine name" placeholder="Wine name" value={name} onChange={setName} maxLength={80} />
          <TextField label="Winery" placeholder="Winery" value={producer} onChange={setProducer} maxLength={80} />
          <TextField label="Vintage" placeholder="Vintage" value={vintage} onChange={(v) => setVintage(v.replace(/\D/g, ''))} maxLength={4} keyboardType="number-pad" />
          <TextField label="Grape variety" placeholder="Grapes" value={grapes} onChange={setGrapes} maxLength={80} />
          <TextField label="Region" placeholder="Region" value={region} onChange={setRegion} maxLength={60} />
          <TextField label="Country" placeholder="Country" value={country} onChange={setCountry} maxLength={40} />
          {note ? (
            <AppText variant="caption" color={colors.textMuted}>
              {note}
            </AppText>
          ) : null}
        </Section>

        <Section title="Style">
          <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Style">
            {styles.map((x) => (
              <Chip key={x} label={x} selected={style === x} onPress={() => setStyle(x)} />
            ))}
          </View>
        </Section>

        <Section title="Storage location">
          {cellars.length > 1 && (
            <Segmented<string>
              accessibilityLabel="Cellar"
              value={targetCellarId ?? ''}
              onChange={setCellarId}
              options={cellars.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
          <Pressable
            onPress={() => setChoosing(true)}
            accessibilityRole="button"
            accessibilityLabel={`Position: ${slot ? formatSlot(slot) : 'no position'}. Change.`}
            style={({ pressed }) => [s.position, pressed && s.pressed]}
          >
            <View style={s.flex}>
              <AppText variant="caption" color={colors.textMuted}>
                {slot && !userPick ? 'Suggested position' : 'Position'}
              </AppText>
              <AppText>{slot ? formatSlot(slot) : free.length ? 'No position for now' : 'This cellar is full'}</AppText>
            </View>
            <AppText variant="caption" color={colors.accent}>
              Change
            </AppText>
          </Pressable>
        </Section>

        {error ? (
          <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}

        <Button label={busy ? 'Saving…' : submitLabel} disabled={!valid || busy} onPress={() => void save()} />
        {footer}
      </ScrollView>

      <PickerSheet
        visible={choosing}
        title="Choose a position"
        reduceMotion={reduceMotion}
        selectedId={slot?.id ?? 'none'}
        sections={[
          ...(['sparkling', 'white', 'red'] as const).map((z) => ({
            title: zoneLabels[z],
            items: free.filter((x) => x.zoneId === z).map((x) => ({ id: x.id, title: `Shelf ${x.shelf}, position ${x.position}` })),
          })),
          { title: 'Other', items: [{ id: 'none', title: 'No position for now' }] },
        ]}
        onPick={(id) => {
          if (targetCellarId) setPicked({ cellarId: targetCellarId, slotId: id === 'none' ? null : id });
          setChoosing(false);
        }}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}

/** Manual bottle registration (spec: Add Bottle → Save). */
export function AddBottleScreen() {
  const router = useRouter();
  const { inventory } = useActiveCellar();
  return (
    <BottleForm
      title="Add bottle"
      submitLabel="Save"
      initial={emptyForm}
      onSubmit={async (input) => {
        const bottle = await inventory.createBottle(input);
        router.replace({ pathname: '/wine/[id]', params: { id: bottle.wineId } });
      }}
    />
  );
}

/** Manual bottle modification (spec: editable page → Save Changes). */
export function EditBottleScreen({ bottleId, wineId }: { bottleId: string; wineId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { inventory } = useActiveCellar();
  const { state, reload } = useQuery<WineDetails | null>(`editBottle|${wineId}`, () => inventory.getWineDetails(wineId));

  const details = state.status === 'ready' ? state.data : null;
  const entry = details?.inCellar.find((x) => x.bottle.id === bottleId);

  if (!details || !entry) {
    return (
      <View style={[s.root, s.content, { paddingTop: insets.top + spacing.sm }]}>
        <BackHeader />
        {state.status === 'loading' && <HomeStateView kind="loading" />}
        {state.status === 'error' && <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />}
        {state.status === 'ready' && (
          <AppText variant="display" accessibilityRole="header">
            Bottle not found
          </AppText>
        )}
      </View>
    );
  }

  const { wine } = details;
  const shared = details.inCellar.length;
  return (
    <BottleForm
      title="Edit bottle"
      submitLabel="Save Changes"
      ownBottleId={bottleId}
      note={shared > 1 ? `Shared by all ${shared} bottles of this wine` : undefined}
      initial={{
        name: wine.name,
        producer: wine.producer,
        vintage: String(wine.vintage),
        style: wine.style,
        grapes: wine.grapes.join(', '),
        region: wine.region,
        country: wine.country,
        cellarId: entry.cellar.id,
        slotId: entry.bottle.slotId,
      }}
      onSubmit={async (input) => {
        await inventory.updateBottle(bottleId, input);
        router.back();
      }}
      footer={
        <RemoveBottle
          onRemove={async (opened) => {
            await (opened ? inventory.openBottle(bottleId) : inventory.removeBottle(bottleId));
            router.back();
          }}
        />
      }
    />
  );
}

/** "Remove Bottle" with confirmation: opened (goes to History) or removed unopened. */
function RemoveBottle({ onRemove }: { onRemove: (opened: boolean) => Promise<void> }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (opened: boolean) => {
    setError(null);
    try {
      await onRemove(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  if (!confirming) return <Button label="Remove Bottle" variant="link" onPress={() => setConfirming(true)} />;
  return (
    <View style={s.confirm}>
      <AppText variant="bodyStrong">Take this bottle out of the cellar?</AppText>
      <AppText variant="caption" color={colors.textSecondary}>
        Opened bottles move to History.
      </AppText>
      <View style={s.confirmRow}>
        <Button label="I opened it" onPress={() => void remove(true)} />
        <Button label="Removed unopened" variant="secondary" onPress={() => void remove(false)} />
      </View>
      <Button label="Keep it" variant="link" onPress={() => setConfirming(false)} />
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Review and correct what the camera read from a label, then confirm to register it (spec: Review and Correct). */
export function ReviewBottlesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { inventory } = useActiveCellar();
  const { state, reload } = useQuery<DetectedBottle[]>('detections', () => inventory.listDetections());
  const list = state.status === 'ready' ? state.data : [];
  const current = list[0];

  // Leave once the last detection is handled.
  const next = () => {
    if (list.length <= 1) router.back();
  };

  if (!current) {
    return (
      <View style={[s.root, s.content, { paddingTop: insets.top + spacing.sm }]}>
        <BackHeader />
        {state.status === 'loading' && <HomeStateView kind="loading" />}
        {state.status === 'error' && <HomeStateView kind="error" message={state.message} actionLabel="Try again" onAction={reload} />}
        {state.status === 'ready' && (
          <AppText variant="display" accessibilityRole="header">
            Nothing to review
          </AppText>
        )}
      </View>
    );
  }

  return (
    <BottleForm
      key={current.id}
      title={list.length > 1 ? `Review bottle · 1 of ${list.length}` : 'Review bottle'}
      submitLabel="Confirm"
      note={`Read from the label · ${Math.round(current.confidence * 100)} % sure`}
      initial={{
        name: current.wine.name,
        producer: current.wine.producer,
        vintage: String(current.wine.vintage),
        style: current.wine.style,
        grapes: current.wine.grapes.join(', '),
        region: current.wine.region,
        country: current.wine.country,
        cellarId: current.cellarId,
        slotId: current.slotId ?? undefined,
      }}
      onSubmit={async (input) => {
        await inventory.confirmDetection(current.id, input);
        next();
      }}
      footer={
        <Button
          label="Not a bottle"
          variant="link"
          accessibilityHint="Dismisses this detection"
          onPress={() => void inventory.dismissDetection(current.id).then(next)}
        />
      }
    />
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    flex: { flex: 1, gap: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    position: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    pressed: { opacity: 0.6 },
    confirm: { gap: spacing.sm },
    confirmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  }),
);
