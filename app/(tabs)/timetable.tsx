import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { DailyScheduleList } from '../../src/components/DailyScheduleList';
import { WeekdayTabs } from '../../src/components/WeekdayTabs';
import { WeekOverviewGrid } from '../../src/components/WeekOverviewGrid';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableMode } from '../../src/db/timetableModeRepository';
import type { TimetableMode } from '../../src/db/types';
import { borderRadius, fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';

const today = () => new Date().getDay();

export default function TimetableScreen() {
  const { theme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [timetableMode, setTimetableMode] = useState<TimetableMode>('regular');
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekView, setWeekView] = useState(false);
  const { colors } = theme;

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDatabase().then(getActiveTimetableMode).then((mode) => { if (active) setTimetableMode(mode); }).catch(() => undefined)
      .finally(() => { if (active) setRefreshKey((value) => value + 1); });
    return () => { active = false; };
  }, []));

  const goToDay = (weekday: number) => { setSelectedDay(weekday); setWeekView(false); };

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{timetableMode === 'vacation' ? '방학 시간표' : '시간표'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={weekView ? '요일별로 보기' : '주간 한눈에 보기'} onPress={() => setWeekView((value) => !value)} style={[styles.toggle, { borderColor: colors.primary, backgroundColor: weekView ? colors.primary : colors.surface }]}>
      <Text style={{ color: weekView ? colors.onPrimary : colors.primary, fontWeight: '700' }}>{weekView ? '요일별로 보기' : '📅 주간 한눈에 보기'}</Text>
    </Pressable>
    {weekView
      ? <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
          <WeekOverviewGrid theme={theme} timetableMode={timetableMode} today={today()} refreshKey={refreshKey} onSelectDay={goToDay} />
        </View>
      : <>
          <WeekdayTabs selected={selectedDay} today={today()} theme={theme} onSelect={setSelectedDay} />
          <DailyScheduleList weekday={selectedDay} isToday={selectedDay === today()} theme={theme} timetableMode={timetableMode} refreshKey={refreshKey} />
        </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  heading: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  toggle: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg, width: '100%' },
  card: { borderRadius: borderRadius.lg, borderWidth: 2, padding: spacing.md, width: '100%' },
});
