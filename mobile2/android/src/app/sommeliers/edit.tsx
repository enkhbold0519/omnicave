import { useLocalSearchParams } from 'expo-router';

import { PersonaEditorScreen } from '@/components/sommelier/PersonaEditorScreen';

export default function PersonaEditorRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PersonaEditorScreen key={id ?? 'new'} personaId={id || undefined} />;
}
