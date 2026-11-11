import { useLocalSearchParams } from 'expo-router';

import { WineDetailsScreen } from '@/components/wine/WineDetailsScreen';

export default function WineDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WineDetailsScreen wineId={id ?? ''} />;
}
