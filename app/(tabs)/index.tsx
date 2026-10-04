import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GemSummaryLine } from '../../src/components/GemSummaryLine';
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
  const { colors } = theme;
  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDatabase()
      .then((database) => getActiveTimetableSet(database))
      .then((saved) => { if (active) setTimetableSet(saved); })
      .catch(() => undefined)
      .finally(() => { if (active) bump(); });
    return () => { active = false; };
  }, [bump]));

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
    <CharacterHeader theme={theme}><View style={styles.header}>
      <Text style={[styles.date, { color: colors.primary }]}>{dateLabel}</Text>
      <Text accessibilityRole="header" textBreakStrategy="balanced" style={[styles.heading, { color: colors.text }]}>{encouragement.title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{encouragement.subtitle}</Text>
    </View></CharacterHeader>
    <PermissionGuide theme={theme} banner={{ onPress: () => router.push('/manage') }} />
    {timetableSet && <TodayScheduleCard refreshKey={refreshKey} theme={theme} setId={timetableSet.id} />}
    <TodayTasksCard theme={theme} refreshKey={refreshKey} onChanged={bump} />
    <GemSummaryLine theme={theme} refreshKey={refreshKey} onPress={() => router.replace('/stickers')} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 18, padding: 20, paddingBottom: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { gap: 6, paddingVertical: 4 }, date: { fontSize: 16, fontWeight: '700' },
  heading: { fontSize: 30, fontWeight: '800' }, subtitle: { fontSize: 16 },
});
