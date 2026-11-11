import { useLocalSearchParams } from 'expo-router';

import { NewTastingScreen, type StartTopic } from '@/components/sommelier/NewTastingScreen';

const topics: StartTopic[] = ['wine', 'tonight', 'pairing', 'open'];

export default function NewTastingRoute() {
  const { topic, wineId } = useLocalSearchParams<{ topic?: string; wineId?: string }>();
  const t = topics.includes(topic as StartTopic) ? (topic as StartTopic) : wineId ? 'wine' : 'open';
  return <NewTastingScreen key={`${t}|${wineId ?? ''}`} topic={t} initialWineId={wineId} />;
}
