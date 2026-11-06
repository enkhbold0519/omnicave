import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { useAuth } from '@/hooks/AuthContext';
import { useAccessibilityPrefs } from '@/hooks/useAccessibilityPrefs';
import { makeStyles, useTheme, type ThemePreference } from '@/theme/ThemeContext';
import { fonts, gutter, palettes, spacing, touchTarget, type Colors, type PaletteId } from '@/theme/tokens';

import { DevScenarioPanel } from './DevScenarioPanel';

const appearanceOptions: { value: ThemePreference; title: string; detail: string }[] = [
  { value: 'system', title: 'System', detail: "Match your phone's setting" },
  { value: 'light', title: 'Light', detail: 'Light surfaces' },
  { value: 'dark', title: 'Dark', detail: 'Dark surfaces, easier at night' },
];

/** Two overlapping discs: the palette's background and its accent, in the current mode. */
function Swatch({ colors, ring }: { colors: Colors; ring: string }) {
  return (
    <View style={swatch.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[swatch.disc, { backgroundColor: colors.background, borderColor: ring }]} />
      <View style={[swatch.disc, swatch.overlap, { backgroundColor: colors.accent, borderColor: ring }]} />
    </View>
  );
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, scheme, preference, setPreference, palette, setPalette } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { reduceMotion } = useAccessibilityPrefs();
  const { user, logOut } = useAuth();
  const [picker, setPicker] = useState<'theme' | 'palette' | null>(null);

  const theme = appearanceOptions.find((o) => o.value === preference) ?? appearanceOptions[0];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: spacing.xxxl }]}>
        <View style={styles.header}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AppText style={styles.avatarText} color={colors.textOnAccent} maxFontSizeMultiplier={1}>
              {initialsOf(user?.username ?? '')}
            </AppText>
          </View>
          <AppText variant="display" accessibilityRole="header" style={styles.center}>
            {user?.username}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            Logged in as {user?.email}
          </AppText>
          <Button label="Edit profile" variant="link" align="center" onPress={() => router.push('/account')} />
        </View>

        <Section title="Appearance">
          <View style={styles.rows}>
            <SettingRow label="Theme" value={theme.title} onPress={() => setPicker('theme')} />
            <SettingRow
              label="Palette"
              value={palettes[palette].name}
              leading={<Swatch colors={palettes[palette][scheme]} ring={colors.hairline} />}
              onPress={() => setPicker('palette')}
            />
          </View>
        </Section>

        {__DEV__ && (
          <Section title="Developer">
            <DevScenarioPanel />
          </Section>
        )}

        <PressableScale
          onPress={() => void logOut()}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          containerStyle={styles.logOut}
          style={styles.logOutHit}
          pressedStyle={styles.pressed}
        >
          <AppText variant="bodyStrong" color={colors.danger}>
            Log out
          </AppText>
        </PressableScale>
      </ScrollView>

      <PickerSheet
        visible={picker === 'theme'}
        title="Theme"
        reduceMotion={reduceMotion}
        selectedId={preference}
        sections={[{ items: appearanceOptions.map((o) => ({ id: o.value, title: o.title, detail: o.detail })) }]}
        onPick={(id) => {
          setPreference(id as ThemePreference);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'palette'}
        title="Palette"
        reduceMotion={reduceMotion}
        selectedId={palette}
        sections={[
          {
            items: (Object.keys(palettes) as PaletteId[]).map((id) => ({
              id,
              title: palettes[id].name,
              detail: palettes[id].description,
              leading: <Swatch colors={palettes[id][scheme]} ring={colors.hairline} />,
            })),
          },
        ]}
        onPick={(id) => {
          setPalette(id as PaletteId);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

/** A compact settings row: label on the left, current value and a chevron on the right; opens a picker. */
function SettingRow({ label, value, leading, onPress }: { label: string; value: string; leading?: ReactNode; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint="Opens a list to choose from"
      scaleTo={0.985}
      style={styles.row}
      pressedStyle={styles.pressed}
    >
      <AppText variant="heading" style={styles.flex}>
        {label}
      </AppText>
      {leading}
      <AppText color={colors.textSecondary}>{value}</AppText>
      <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
    header: { alignItems: 'center', gap: spacing.xs },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    avatarText: { fontFamily: fonts.medium, fontSize: 26, lineHeight: 32 },
    center: { textAlign: 'center' },
    flex: { flex: 1 },
    rows: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    row: {
      minHeight: touchTarget + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    pressed: { opacity: 0.6 },
    logOut: { alignSelf: 'center' },
    logOutHit: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.lg },
  }),
);

const swatch = StyleSheet.create({
  row: { flexDirection: 'row', width: 34 },
  disc: { width: 20, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  overlap: { marginLeft: -6 },
});
