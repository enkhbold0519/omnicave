import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveCellarProvider } from '@/hooks/ActiveCellarContext';
import { AuthProvider, useAuth } from '@/hooks/AuthContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <ActiveCellarProvider>
            <RootNavigator />
          </ActiveCellarProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const { user } = useAuth();
  // Fonts ship inside the package, so this works offline.
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Spec: inventory functions require authentication. */}
        <Stack.Protected guard={!!user} redirectTo="/login">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="add-bottle" />
          <Stack.Screen name="edit-bottle" />
          <Stack.Screen name="review-bottles" />
          <Stack.Screen name="wine/[id]" />
          <Stack.Screen name="briefing/[id]" />
          <Stack.Screen name="history" />
          <Stack.Screen name="tasting/new" />
          <Stack.Screen name="tasting/[id]" />
          <Stack.Screen name="sommeliers/index" />
          <Stack.Screen name="sommeliers/edit" />
          <Stack.Screen name="account" />
          <Stack.Screen name="settings/cellars" />
          <Stack.Screen name="settings/cellar" />
          <Stack.Screen name="settings/alerts" />
          <Stack.Screen name="settings/taste" />
          <Stack.Screen name="settings/privacy" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
