import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../db/database';
import { setTaskCompletionWithRewards } from '../db/rewardRepository';
import { getTodayTasks, type TodayTask } from '../db/taskRepository';
import { requestTaskRollingScheduleRefresh } from '../notifications/taskRollingSchedule';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function TodayTasksCard({ theme, refreshKey, onChanged }: { readonly theme: ThemeDefinition; readonly refreshKey: number; readonly onChanged?: () => void }) {
  const [tasks, setTasks] = useState<readonly TodayTask[]>([]);
  const [loadedKey, setLoadedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 알림 재예약 실패 안내는 조회 오류와 따로 두어, 체크 뒤 재조회가 성공해도 지워지지 않게 한다(다음 체크 성공 때 지움)
  const [notice, setNotice] = useState('');
  const [celebration, setCelebration] = useState<{ readonly date: string; readonly message: string } | null>(null);
  const requestId = useRef(0);
  const [rewardScale] = useState(() => new Animated.Value(1));
  const date = dateKey(new Date());
  const weekday = new Date().getDay();
  const queryKey = `${date}:${refreshKey}`;
  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    try {
      const saved = await getTodayTasks(await getDatabase(), date, weekday);
      if (currentRequestId !== requestId.current) return;
      setTasks(saved);
      setLoadedKey(queryKey);
      if (!saved.length || saved.some((task) => !task.completed)) setCelebration(null);
      setError('');
    } catch {
      if (currentRequestId !== requestId.current) return;
      setTasks([]); setLoadedKey(queryKey); setError('오늘 할 일을 불러오지 못했어요.');
    }
  }, [date, weekday, queryKey]);
  useEffect(() => {
    let active = true;
    const currentRequestId = ++requestId.current;
    void getDatabase()
      .then((db) => getTodayTasks(db, date, weekday))
      .then((saved) => {
        if (active && currentRequestId === requestId.current) { setTasks(saved); setLoadedKey(queryKey); if (!saved.length || saved.some((task) => !task.completed)) setCelebration(null); setError(''); }
      })
      .catch(() => {
        if (active && currentRequestId === requestId.current) { setTasks([]); setLoadedKey(queryKey); setError('오늘 할 일을 불러오지 못했어요.'); }
      });
    return () => { active = false; };
  }, [date, refreshKey, weekday, queryKey]);
  useEffect(() => {
    if (!celebration || celebration.date !== date) return;
    rewardScale.setValue(0.6);
    Animated.spring(rewardScale, { toValue: 1, useNativeDriver: true }).start();
  }, [celebration, date, rewardScale]);
  // 같은 날짜의 재조회 중에는 이전 목록을 그대로 보여 주되(깜빡임 방지) 최신 결과가 오기 전까지 체크는 막는다
  const stale = loadedKey !== queryKey;
  const loadedToday = loadedKey.startsWith(`${date}:`);
  const visibleTasks = loadedToday ? tasks : [];
  const completed = visibleTasks.filter((task) => task.completed).length;
  const toggle = async (task: TodayTask) => {
    if (busy || stale) return;
    setBusy(true);
    let scheduleRefreshFailed = false;
    try {
      const database = await getDatabase();
      await setTaskCompletionWithRewards(database, task.id, date, weekday, !task.completed);
      try { await requestTaskRollingScheduleRefresh(); } catch { scheduleRefreshFailed = true; }
      const updated = await getTodayTasks(database, date, weekday);
      if (!task.completed && updated.length && updated.every((item) => item.completed)) setCelebration({ date, message: '오늘 할 일을 모두 끝냈어요! ✨' });
      else setCelebration(null);
      setNotice(scheduleRefreshFailed ? '할 일은 저장됐지만 알림을 다시 예약하지 못했어요. 앱을 다시 열면 다시 시도해요.' : '');
      if (date === dateKey(new Date())) await load();
      onChanged?.();
    } catch {
      setError('할 일 상태를 저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const remaining = visibleTasks.length - completed;
  const remainingCopy = !visibleTasks.length ? '' : remaining > 0 ? `아직 ${remaining}개 남았어요` : '오늘 할 일을 다 했어요! ✨';
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <View style={styles.titleRow}><Text style={[styles.title, { color: theme.colors.text }]}>오늘의 할 일</Text>{!!visibleTasks.length && <Text style={[styles.badge, { color: theme.colors.primary, backgroundColor: theme.colors.background }]}>{completed} / {visibleTasks.length}</Text>}</View>
    {!!remainingCopy && <Text style={[styles.remaining, { color: remaining > 0 ? theme.colors.textMuted : theme.colors.text }]}>{remainingCopy}</Text>}
    {!!visibleTasks.length && <View style={[styles.progress, { backgroundColor: theme.colors.border }]}><View style={[styles.bar, { backgroundColor: theme.colors.primary, width: `${(completed / visibleTasks.length) * 100}%` }]} /></View>}
    {visibleTasks.map((task) => <Pressable key={task.id} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(task.completed), disabled: busy || stale }} disabled={busy || stale} onPress={() => void toggle(task)} style={({ pressed }) => [styles.task, { borderColor: theme.colors.border, backgroundColor: task.completed ? theme.colors.background : theme.colors.surface, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.check, { borderColor: task.completed ? theme.colors.primary : theme.colors.border, backgroundColor: task.completed ? theme.colors.primary : theme.colors.surface }]}><Text style={[styles.taskMark, { color: theme.colors.onPrimary }]}>{task.completed ? '✓' : ''}</Text></View><Text style={[styles.taskTitle, { color: task.completed ? theme.colors.textMuted : theme.colors.text, textDecorationLine: task.completed ? 'line-through' : 'none' }]}>{task.title}</Text></Pressable>)}
    {error || notice ? <Text style={[styles.error, { color: theme.colors.text }]}>⚠️ {error || notice}</Text> : !visibleTasks.length && <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{loadedToday ? '오늘 할 일이 없어요.' : '오늘 할 일을 불러오는 중이에요.'}</Text>}
    {celebration?.date === date && <Animated.Text accessibilityLiveRegion="polite" style={[styles.celebration, { color: theme.colors.text, transform: [{ scale: rewardScale }] }]}>{celebration.message}</Animated.Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: borderRadius.lg, gap: 12, padding: 20, width: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSize.lg, fontWeight: '800', flexShrink: 1 }, badge: { fontSize: 16, fontWeight: '700', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  remaining: { fontSize: fontSize.sm, fontWeight: '700' },
  progress: { borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 4 }, bar: { height: '100%' },
  task: { alignItems: 'center', borderWidth: 1, borderRadius: borderRadius.md, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-start', minHeight: touchTarget.minimum + 16, paddingHorizontal: spacing.md },
  check: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  taskMark: { fontSize: 18, fontWeight: '800' }, taskTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '600', paddingVertical: 12 },
  empty: { fontSize: fontSize.sm }, error: { fontSize: fontSize.sm, fontWeight: '700' },
  celebration: { fontSize: fontSize.lg, fontWeight: '700' },
});

