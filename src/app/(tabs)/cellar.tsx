import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';

export default function CellarPlaceholder() {
  const { activeCellar } = useActiveCellar();
  return (
    <PlaceholderScreen
      title="Cellar"
      icon="grid-outline"
      description="Cellar map, sensors and environment history. Not implemented in Phase 1."
      details={[{ label: 'Active cellar', value: activeCellar?.name ?? '—' }]}
    />
  );
}
