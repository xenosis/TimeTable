import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { getDatabase } from '../../src/db/database';
import { getEditableTimetableItemById, type EditableTimetableItem } from '../../src/db/timetableRepository';
import { borderRadius, fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';

function parseItemId(value: string | string[] | undefined): number | null {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function ScheduleDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useActiveTheme();
  const [item, setItem] = useState<EditableTimetableItem | null>(null);
  const [loadedItemId, setLoadedItemId] = useState<number | null>(null);
  const [status, setStatus] = useState('일정을 불러오는 중이에요.');
  const itemId = parseItemId(rawId);
  const displayStatus = !itemId ? '열 수 없는 일정이에요.' : loadedItemId === itemId ? status : '일정을 불러오는 중이에요.';
  const visibleItem = loadedItemId === itemId ? item : null;

  useEffect(() => {
    let active = true;
    if (!itemId) {
      return () => { active = false; };
    }
    void getDatabase().then((database) => getEditableTimetableItemById(database, itemId)).then((saved) => {
      if (!active) return;
      setItem(saved);
      setLoadedItemId(itemId);
      setStatus(saved ? '' : '이 일정은 변경되었거나 삭제되었어요.');
    }).catch(() => { if (active) { setLoadedItemId(itemId); setStatus('일정을 불러오지 못했어요.'); } });
    return () => { active = false; };
  }, [itemId]);

  return <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
    <Stack.Screen options={{ title: '알림 일정' }} />
    {visibleItem && <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{visibleItem.title}</Text>
      <Text style={[styles.time, { color: theme.colors.textMuted }]}>{visibleItem.startTime} ~ {visibleItem.endTime}</Text>
      <Text style={[styles.copy, { color: theme.colors.textMuted }]}>알림을 누르면 이 일정으로 바로 올 수 있어요.</Text>
    </View>}
    {!!displayStatus && <Text style={[styles.copy, { color: theme.colors.textMuted }]}>{displayStatus}</Text>}
    <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
      <Text style={{ color: theme.colors.onPrimary }}>오늘 시간표 보기</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.lg },
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: '700' }, time: { fontSize: fontSize.lg }, copy: { fontSize: fontSize.md, textAlign: 'center' },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum },
});
