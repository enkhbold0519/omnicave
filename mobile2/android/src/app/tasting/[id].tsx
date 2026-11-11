import { useLocalSearchParams } from 'expo-router';

import { DebateScreen } from '@/components/sommelier/DebateScreen';

export default function TastingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebateScreen debateId={id ?? ''} />;
}
