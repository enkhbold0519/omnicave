import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const tabs: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Cellar', icon: 'wine-outline', activeIcon: 'wine' },
  { name: 'inventory', title: 'Search', icon: 'search-outline', activeIcon: 'search' },
  { name: 'sommelier', title: 'Sommelier', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'briefing', title: 'Briefing', icon: 'sunny-outline', activeIcon: 'sunny' },
  { name: 'value', title: 'Value', icon: 'trending-up-outline', activeIcon: 'trending-up' },
  { name: 'profile', title: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: fonts.regular, fontSize: 10.5, letterSpacing: 0.2 },
        animation: 'none',
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
              <Ionicons name={focused ? t.activeIcon : t.icon} size={size - 4} color={color as string} />
            ),
          }}
        />
      ))}
      <Tabs.Screen name="cellar" options={{ href: null }} />
    </Tabs>
  );
}
