import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Palette } from '@/constants/palette';
import { ScanProvider } from '@/state/scan-store';

SplashScreen.preventAutoHideAsync();

// Deep links (Quick Settings tile, app shortcuts) open on top of the tabs, so Back leads home.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <ScanProvider>
        <StatusBar style="dark" />
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Palette.background },
            headerShadowVisible: false,
            headerTintColor: Palette.navy,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: Palette.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'New check' }} />
          <Stack.Screen
            name="analyzing"
            options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
          />
          <Stack.Screen
            name="result"
            options={{ title: 'Your result', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen name="inconclusive" options={{ headerShown: false }} />
          <Stack.Screen name="scan-error" options={{ headerShown: false }} />
          <Stack.Screen name="learn/[topic]" options={{ title: 'Learn & Protect' }} />
          <Stack.Screen name="emergency" options={{ title: 'Emergency help' }} />
          <Stack.Screen
            name="quick-capture"
            options={{ title: 'Quick Capture', animation: 'slide_from_bottom' }}
            dangerouslySingular={() => 'quick-capture'}
          />
        </Stack>
      </ScanProvider>
    </ThemeProvider>
  );
}
