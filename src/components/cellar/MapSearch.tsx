import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { makeStyles, useTheme } from '@/theme/ThemeContext';
import { fonts, radii, spacing, touchTarget, typography } from '@/theme/tokens';

interface MapSearchProps {
  query: string;
  onChangeQuery: (q: string) => void;
  /** Placed matches on the map. */
  total: number;
  /** Zero-based index of the match the rack is scrolled to. */
  index: number;
  /** Matches that are in the cellar without a position. */
  unplacedMatches: number;
  onStep: (delta: 1 | -1) => void;
}

/** Search field for the map, with "2 of 3" and ↑/↓ to step through matches on the rack. */
export function MapSearch({ query, onChangeQuery, total, index, unplacedMatches, onStep }: MapSearchProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const searching = query.trim() !== '';

  let status = '';
  if (searching) {
    if (total === 0 && unplacedMatches === 0) status = `No bottles match “${query.trim()}” in this cellar.`;
    else if (total === 0) status = `${unplacedMatches} matching ${unplacedMatches === 1 ? 'bottle has' : 'bottles have'} no position yet.`;
    else {
      status = `${index + 1} of ${total} ${total === 1 ? 'bottle' : 'bottles'}`;
      if (unplacedMatches) status += ` · ${unplacedMatches} without a position`;
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.field}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Find a wine in this cellar"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          maxFontSizeMultiplier={1.6}
          accessibilityLabel="Find a wine on the cellar map"
        />
        {query ? (
          <PressableScale onPress={() => onChangeQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {searching && (
        <View style={styles.status}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.flex} accessibilityLiveRegion="polite">
            {status}
          </AppText>
          {total > 1 && (
            <>
              <IconButton icon="chevron-up" accessibilityLabel="Previous match" onPress={() => onStep(-1)} />
              <IconButton icon="chevron-down" accessibilityLabel="Next match" onPress={() => onStep(1)} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { gap: spacing.xs },
    flex: { flex: 1 },
    field: {
      minHeight: touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      minHeight: touchTarget,
      fontFamily: fonts.regular,
      fontSize: typography.body.fontSize,
      color: c.textPrimary,
      paddingVertical: 0,
    },
    clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    status: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
  }),
);
