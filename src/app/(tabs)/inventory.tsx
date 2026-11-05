import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';
import { useActiveCellar } from '@/hooks/ActiveCellarContext';

export default function InventoryPlaceholder() {
  const { activeCellar } = useActiveCellar();
  return (
    <PlaceholderScreen
      title="Inventory"
      icon="wine-outline"
      description="Search and browse your bottles. Not implemented in Phase 1."
      details={[{ label: 'Active cellar', value: activeCellar?.name ?? '—' }]}
    />
  );
}
