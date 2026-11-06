import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const tabs: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'inventory', title: 'Inventory', icon: 'wine-outline', activeIcon: 'wine' },
  { name: 'cellar', title: 'Cellar', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'sommelier', title: 'Sommelier', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // Same background as the page with a hairline above: the bar recedes instead of forming a block.
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: fonts.regular, fontSize: 10.5, letterSpacing: 0.2 },
        // Tabs are peers: switching never animates (animate-expo).
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
    </Tabs>
  );
}
