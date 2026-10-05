import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CharacterHeader } from '../../src/components/CharacterHeader';
import { PermissionGuide } from '../../src/components/PermissionGuide';
import { TodayScheduleCard } from '../../src/components/TodayScheduleCard';
import { TodayTasksCard } from '../../src/components/TodayTasksCard';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableSet } from '../../src/db/timetableSetRepository';
import type { TimetableSet } from '../../src/db/types';
import { useActiveTheme } from '../../src/theme/provider';
import { dailyEncouragement } from '../../src/theme/dailyEncouragement';
import { msUntilNextLocalMidnight } from '../../src/utils/date';
import { subscribeWidgetChecksApplied } from '../../src/widgets/widgetChecksSignal';

export default function TodayScreen() {
  const { theme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [timetableSet, setTimetableSet] = useState<TimetableSet | null>(null);
  const [setStatus, setSetStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [resolvedRefreshKey, setResolvedRefreshKey] = useState(-1);
  const status = resolvedRefreshKey === refreshKey ? setStatus : 'loading';
  const { colors } = theme;
  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  useFocusEffect(useCallback(() => { bump(); }, [bump]));
  useEffect(() => {
    let active = true;
    void getDatabase().then(getActiveTimetableSet).then((saved) => {
      if (active) { setTimetableSet(saved); setSetStatus('ready'); setResolvedRefreshKey(refreshKey); }
    }).catch(() => {
      if (active) { setTimetableSet(null); setSetStatus('error'); setResolvedRefreshKey(refreshKey); }
    });
    return () => { active = false; };
  }, [refreshKey]);
  // 위젯에서 누른 체크가 DB에 반영되면(앱이 실행될 때 뒤늦게 기록된다) 오늘 할 일과 보석을 다시 읽는다.
  useEffect(() => subscribeWidgetChecksApplied(bump), [bump]);

  // 앱을 켜 둔 채로 자정을 넘기거나 백그라운드에서 돌아오면 "오늘" 기준 화면을 다시 그린다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') bump(); });
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightBump = () => {
      timer = setTimeout(() => { bump(); scheduleMidnightBump(); }, msUntilNextLocalMidnight(new Date()));
    };
    scheduleMidnightBump();
    return () => { subscription.remove(); clearTimeout(timer); };
  }, [bump]);

  const today = new Date();
  const encouragement = dailyEncouragement(today);
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 · ${['일', '월', '화', '수', '목', '금', '토'][today.getDay()]}요일`;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
    <CharacterHeader theme={theme} compact><View style={styles.header}>
      <Text style={[styles.date, { color: colors.primary }]}>{dateLabel}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{encouragement.subtitle}</Text>
    </View></CharacterHeader>
    <PermissionGuide theme={theme} banner={{ onPress: () => router.push('/manage') }} />
    {status !== 'ready' && <View style={[styles.scheduleStatus, { backgroundColor: theme.decorations.cardBackground }]}><Text style={{ color: colors.text }}>{status === 'loading' ? '오늘 일정을 불러오는 중이에요.' : '오늘 일정을 불러오지 못했어요.'}</Text>{status === 'error' && <Pressable accessibilityRole="button" onPress={bump} style={styles.retry}><Text style={{ color: colors.primary }}>다시 불러오기</Text></Pressable>}</View>}
    <TodayScheduleCard refreshKey={refreshKey} theme={theme} setId={status === 'ready' ? timetableSet?.id ?? null : null}>
      <TodayTasksCard theme={theme} refreshKey={refreshKey} onChanged={bump} />
    </TodayScheduleCard>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scheduleStatus: { padding: 20, borderRadius: 24, gap: 12 }, retry: { minHeight: 56, justifyContent: 'center' },
  container: { flexGrow: 1, gap: 14, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { gap: 4, paddingVertical: 10 }, date: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
});
