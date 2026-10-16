import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Slot, Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImmersive } from '../../src/store/immersiveMode';
import { fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { GemCollectionArtwork } from '../../src/components/GemCollectionArtwork';
import { ParentHome } from '../../src/components/ParentHome';
import { isParentDevice, useAccount } from '../../src/store/accountStore';

type Tab = { readonly path: '/' | '/timetable' | '/stickers'; readonly label: string; readonly icon: string };

const childTabs: readonly Tab[] = [
  { path: '/', label: '오늘', icon: '☀️' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
  { path: '/stickers', label: '내 보석', icon: '💎' },
];

// 아빠 폰: 현황(아빠 화면)과 딸과 같은 시간표(요일별·주간)를 볼 수 있다. 보석 탭은 딸 화면에만 둔다
const parentTabs: readonly Tab[] = [
  { path: '/', label: '현황', icon: '📊' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
];

export default function TabsLayout() {
  const pathname = usePathname();
  const { theme } = useActiveTheme();
  const insets = useSafeAreaInsets();
  const immersive = useImmersive();
  const account = useAccount();
  const parent = isParentDevice(account);
  const tabs = parent ? parentTabs : childTabs;
  // 아빠 폰은 시간표 탭 외에는 모두 아빠 화면을 같은 자리에 그린다(화면 이동 없이 그려 관리자 화면이 열려 있어도 튀지 않는다)
  const showParentHome = parent && pathname !== '/timetable';
  const isActive = (path: Tab['path']) => (parent && path === '/' ? showParentHome : pathname === path);

  return <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.content}>{showParentHome ? <ParentHome theme={theme} /> : <Slot />}</View>
    {!immersive && <View style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
      {tabs.map(({ path, label, icon }) => {
        const active = isActive(path);
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
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: fontSize.sm },
});
