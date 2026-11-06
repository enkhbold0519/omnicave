import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChoiceRow } from '@/components/ui/ChoiceRow';
import { Section } from '@/components/ui/Section';
import { useAuth } from '@/hooks/AuthContext';
import { makeStyles, useTheme, type ThemePreference } from '@/theme/ThemeContext';
import { gutter, palettes, spacing, type Colors, type PaletteId } from '@/theme/tokens';

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

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, scheme, preference, setPreference, palette, setPalette } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { user, logOut } = useAuth();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: spacing.xxxl }]}
    >
      <View style={styles.intro}>
        <AppText variant="overline" color={colors.textMuted}>
          Profile
        </AppText>
        <AppText variant="display" accessibilityRole="header">
          {user?.username}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Logged in as {user?.email}
        </AppText>
      </View>

      <Section title="Account">
        <View style={styles.account}>
          <Button label="Edit profile" variant="secondary" onPress={() => router.push('/account')} />
          <Button label="Log Out" variant="link" onPress={() => void logOut()} />
        </View>
      </Section>

      <Section title="Appearance">
        <View accessibilityRole="radiogroup">
          {appearanceOptions.map((o, i) => (
            <ChoiceRow
              key={o.value}
              title={o.title}
              detail={o.detail}
              selected={preference === o.value}
              onPress={() => setPreference(o.value)}
              first={i === 0}
            />
          ))}
        </View>
      </Section>

      <Section title="Palette">
        <View accessibilityRole="radiogroup">
          {(Object.keys(palettes) as PaletteId[]).map((id, i) => (
            <ChoiceRow
              key={id}
              title={palettes[id].name}
              detail={palettes[id].description}
              selected={palette === id}
              onPress={() => setPalette(id)}
              first={i === 0}
              leading={<Swatch colors={palettes[id][scheme]} ring={colors.hairline} />}
            />
          ))}
        </View>
      </Section>

      {__DEV__ && (
        <Section title="Developer">
          <DevScenarioPanel />
        </Section>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: gutter, gap: spacing.xxxl },
    intro: { gap: spacing.sm },
    account: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  }),
);

const swatch = StyleSheet.create({
  row: { flexDirection: 'row', width: 34 },
  disc: { width: 20, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  overlap: { marginLeft: -6 },
});
