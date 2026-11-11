import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
import { briefings } from '@/data/mockDb';

export default function BriefingPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const briefing = briefings.find((b) => b.id === id);
  return (
    <PlaceholderScreen
      title="Briefing"
      icon="newspaper-outline"
      description="Full daily briefing. Not implemented in Phase 1."
      details={[
        { label: 'Briefing ID', value: id ?? '—' },
        { label: 'Matched record', value: briefing?.title ?? 'Not found' },
      ]}
      showBack
    />
  );
}
