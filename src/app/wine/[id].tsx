import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
import { wines } from '@/data/mockDb';

export default function WineDetailsPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wine = wines.find((w) => w.id === id);
  return (
    <PlaceholderScreen
      title="Wine Details"
      icon="wine-outline"
      description="Full wine profile. Not implemented in Phase 1."
      details={[
        { label: 'Wine ID', value: id ?? '—' },
        { label: 'Matched record', value: wine ? `${wine.vintage} ${wine.name}` : 'Not found' },
      ]}
      showBack
    />
  );
}
