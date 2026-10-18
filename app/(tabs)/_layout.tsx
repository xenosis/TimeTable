import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Slot, Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImmersive } from '../../src/store/immersiveMode';
import { fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { GemCollectionArtwork } from '../../src/components/GemCollectionArtwork';
import { isParentDevice, useAccount } from '../../src/store/accountStore';

type Tab = { readonly path: '/' | '/timetable' | '/stickers' | '/manage'; readonly label: string; readonly icon: string };

const childTabs: readonly Tab[] = [
  { path: '/', label: '오늘', icon: '☀️' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
  { path: '/stickers', label: '내 보석', icon: '💎' },
  { path: '/manage', label: '설정', icon: '⚙️' },
];

// 아빠 폰: 현황(아빠 화면)과 딸과 같은 시간표(요일별·주간)를 볼 수 있다. 보석 탭은 딸 화면에만 둔다
const parentTabs: readonly Tab[] = [
  { path: '/', label: '현황', icon: '📊' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
  { path: '/manage', label: '설정', icon: '⚙️' },
];

// 렌더링마다 새 객체를 넘기면 Stack.Screen이 setOptions를 반복 호출하므로 고정 객체를 쓴다
const screenOptions = { headerShown: false } as const;

export default function TabsLayout() {
  const pathname = usePathname();
  const { theme } = useActiveTheme();
  const insets = useSafeAreaInsets();
  const immersive = useImmersive();
  const account = useAccount();
  const parent = isParentDevice(account);
  const tabs = parent ? parentTabs : childTabs;

  return <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <Stack.Screen options={screenOptions} />
    {/* 아빠·딸 모두 항상 Slot을 그린다. v1.64.0에서 아빠 폰만 Slot을 떼었다 붙였더니 현황 탭 전환 때 무한 렌더링으로 앱이 꺼졌다. 아빠 현황은 index 경로가 고른다 */}
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
