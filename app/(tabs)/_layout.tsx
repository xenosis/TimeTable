import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Slot, Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImmersive } from '../../src/store/immersiveMode';
import { fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { GemCollectionArtwork } from '../../src/components/GemCollectionArtwork';

const tabs = [
  { path: '/', label: '오늘', icon: '☀️' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
  { path: '/stickers', label: '내 보석', icon: '💎' },
] as const;

export default function TabsLayout() {
  const pathname = usePathname();
  const { theme } = useActiveTheme();
  const insets = useSafeAreaInsets();
  const immersive = useImmersive();

  return <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.content}><Slot /></View>
    {!immersive && <View style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
      {tabs.map(({ path, label, icon }) => {
        const active = pathname === path;
        return <Pressable
          key={path}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`${label} 탭`}
          onPress={() => router.replace(path)}
          style={({ pressed }) => [styles.tabButton, { backgroundColor: active ? theme.character?.softColor ?? theme.colors.background : theme.colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          {path === '/stickers' ? <GemCollectionArtwork kind="gem" size={28} /> : <Text accessible={false} style={styles.tabIcon}>{icon}</Text>}
          <Text style={[styles.tabLabel, { color: active ? theme.colors.primary : theme.colors.textMuted, fontWeight: active ? '700' : '600' }]}>{label}</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="관리자 설정 열기" onPress={() => router.push('/manage')} style={({ pressed }) => [styles.tabButton, { opacity: pressed ? 0.7 : 1 }]}>
        <Text accessible={false} style={styles.tabIcon}>⚙️</Text>
        <Text style={[styles.tabLabel, { color: theme.colors.textMuted }]}>설정</Text>
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  tabBar: { borderTopWidth: 1, flexDirection: 'row', paddingTop: spacing.xs },
  tabButton: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', minHeight: touchTarget.minimum, paddingVertical: spacing.xs, borderRadius: 18, marginHorizontal: 4 },
  tabIcon: { fontSize: 24 },
  tabLabel: { fontSize: fontSize.sm },
});
