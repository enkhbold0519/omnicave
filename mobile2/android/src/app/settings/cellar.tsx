import { useLocalSearchParams } from 'expo-router';

import { CellarFormScreen } from '@/components/settings/SettingsScreens';

export default function CellarFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CellarFormScreen key={id ?? 'new'} cellarId={id || undefined} />;
}
