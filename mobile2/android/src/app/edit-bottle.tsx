import { useLocalSearchParams } from 'expo-router';

import { EditBottleScreen } from '@/components/inventory/BottleFormScreens';

export default function EditBottleRoute() {
  const { bottleId, wineId } = useLocalSearchParams<{ bottleId: string; wineId: string }>();
  return <EditBottleScreen key={bottleId} bottleId={bottleId ?? ''} wineId={wineId ?? ''} />;
}
