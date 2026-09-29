import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Slot, Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';

const tabs = [
  { path: '/', label: '오늘', icon: '🏠' },
  { path: '/timetable', label: '시간표', icon: '🗓️' },
  { path: '/stickers', label: '내 보석', icon: '💎' },
] as const;

export default function TabsLayout() {
  const pathname = usePathname();
  const { theme } = useActiveTheme();
  const insets = useSafeAreaInsets();

  return <View style={styles.container}>
    <Stack.Screen options={{
      title: 'TimeTable',
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="관리자 설정 열기" onPress={() => router.push('/manage')} style={styles.gearButton}>
        <Text style={styles.gearGlyph}>⚙️</Text>
      </Pressable>,
    }} />
    <View style={styles.content}><Slot /></View>
    <View style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
      {tabs.map(({ path, label, icon }) => {
        const active = pathname === path;
        return <Pressable
          key={path}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`${label} 탭`}
          onPress={() => router.replace(path)}
          style={styles.tabButton}
        >
          <Text style={styles.tabIcon}>{icon}</Text>
          <Text style={[styles.tabLabel, { color: active ? theme.colors.primary : theme.colors.textMuted, fontWeight: active ? '700' : '600' }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  gearButton: { alignItems: 'center', justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum },
  gearGlyph: { fontSize: fontSize.lg },
  tabBar: { borderTopWidth: 1, flexDirection: 'row', paddingTop: spacing.xs },
  tabButton: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingVertical: spacing.xs },
  tabIcon: { fontSize: 24 },
  tabLabel: { fontSize: fontSize.sm },
});
