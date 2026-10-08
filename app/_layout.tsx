import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { RollingRefreshLifecycle } from '../src/notifications/RollingRefreshLifecycle';
import { AccountLifecycle } from '../src/server/AccountLifecycle';
import { SyncLifecycle } from '../src/sync/SyncLifecycle';
import { PushLifecycle } from '../src/push/PushLifecycle';
import { SchoolAutoRefreshLifecycle } from '../src/neis/SchoolAutoRefreshLifecycle';
import { ThemeProvider, useActiveTheme } from '../src/theme/provider';

export default function RootLayout() {
  return <ThemeProvider><RollingRefreshLifecycle /><AccountLifecycle /><SyncLifecycle /><PushLifecycle /><SchoolAutoRefreshLifecycle /><ThemedRootLayout /></ThemeProvider>;
}

function ThemedRootLayout() {
  const { theme } = useActiveTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: theme.colors.onPrimary,
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="manage" options={{ title: '관리자 설정' }} />
        <Stack.Screen name="push-change" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
