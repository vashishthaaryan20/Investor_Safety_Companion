import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/design';
import { ScanProvider } from '@/state/scan-store';

SplashScreen.preventAutoHideAsync();

// Deep links (Analyze screen tile, share sheet) open on top of the tabs, so Back leads home.
export const unstable_settings = {
  anchor: '(tabs)',
};

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.backgroundTop,
    text: Colors.ink,
    border: Colors.border,
    notification: Colors.critical,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <ScanProvider>
        <StatusBar style="light" />
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.backgroundTop },
            headerShadowVisible: false,
            headerTintColor: Colors.accent,
            headerTitleStyle: { fontWeight: '800', fontSize: 18, color: Colors.ink },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'New check' }} />
          <Stack.Screen
            name="analyzing"
            options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
            dangerouslySingular={() => 'analyzing'}
          />
          <Stack.Screen
            name="result"
            options={{ title: 'Your result', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen name="inconclusive" options={{ headerShown: false }} />
          <Stack.Screen name="scan-error" options={{ headerShown: false }} />
          <Stack.Screen name="learn/[topic]" options={{ title: 'Learn & Protect' }} />
          <Stack.Screen name="emergency" options={{ title: 'Emergency help' }} />
          {/* Not singular: removing an older instance from under a result desyncs the native stack. */}
          <Stack.Screen
            name="screen-context"
            options={{ title: 'Check with SANGYAN', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="scam-check" options={{ headerShown: false }} />
        </Stack>
      </ScanProvider>
    </ThemeProvider>
  );
}
