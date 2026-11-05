import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';

export default function AddBottlePlaceholder() {
  const { activeCellar } = useActiveCellar();
  return (
    <PlaceholderScreen
      title="Add Bottle"
      icon="add-circle-outline"
      description="Bottle registration. Not implemented in Phase 1."
      details={[{ label: 'Target cellar', value: activeCellar?.name ?? '—' }]}
      showBack
    />
  );
}
