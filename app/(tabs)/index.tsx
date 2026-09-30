import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GemSummaryLine } from '../../src/components/GemSummaryLine';
import { PermissionGuide } from '../../src/components/PermissionGuide';
import { TodayScheduleCard } from '../../src/components/TodayScheduleCard';
import { TodayTasksCard } from '../../src/components/TodayTasksCard';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableSet } from '../../src/db/timetableSetRepository';
import type { TimetableSet } from '../../src/db/types';
import { fontSize, spacing } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { msUntilNextLocalMidnight } from '../../src/utils/date';

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

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>오늘도 해보자! ✨</Text>
    <PermissionGuide theme={theme} banner={{ onPress: () => router.push('/manage') }} />
    {timetableSet && <TodayScheduleCard refreshKey={refreshKey} theme={theme} setId={timetableSet.id} />}
    <TodayTasksCard theme={theme} refreshKey={refreshKey} onChanged={bump} />
    <GemSummaryLine theme={theme} refreshKey={refreshKey} onPress={() => router.replace('/stickers')} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  heading: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
});
