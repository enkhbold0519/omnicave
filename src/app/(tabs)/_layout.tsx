import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const tabs: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'inventory', title: 'Inventory', icon: 'wine-outline', activeIcon: 'wine' },
  { name: 'cellar', title: 'Cellar', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'sommelier', title: 'Sommelier', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarAllowFontScaling: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? t.activeIcon : t.icon} size={size - 2} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
