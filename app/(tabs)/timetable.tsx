import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyScheduleList } from '../../src/components/DailyScheduleList';
import { WeekdayTabs } from '../../src/components/WeekdayTabs';
import { WeekOverviewGrid } from '../../src/components/WeekOverviewGrid';
import { WEEK_HINT, WeekDayHeader } from '../../src/components/WeekTimeGrid';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableSet } from '../../src/db/timetableSetRepository';
import type { TimetableSet } from '../../src/db/types';
import { setImmersive } from '../../src/store/immersiveMode';
import { borderRadius, fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { msUntilNextLocalMidnight } from '../../src/utils/date';
import { defaultSchoolWeekday, SCHOOL_WEEKDAYS } from '../../src/utils/weekdays';

const today = () => new Date().getDay();

export default function TimetableScreen() {
  const todayDay = today();
  const { theme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [timetableSet, setTimetableSet] = useState<TimetableSet | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => defaultSchoolWeekday(todayDay));
  const [weekView, setWeekView] = useState(false);
  const { colors } = theme;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 가로에서는 세로 공간이 좁아 큰 제목을 숨기고 표가 화면을 최대한 쓰게 한다
  const compact = width > height;
  // 가로 주간 보기에서는 앱 헤더·하단 탭도 숨겨 표가 화면 높이를 최대한 쓰게 한다(세로로 돌리거나 요일별 보기로 돌아오면 복구)
  useEffect(() => { setImmersive(compact && weekView); return () => setImmersive(false); }, [compact, weekView]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDatabase().then((database) => getActiveTimetableSet(database)).then((saved) => { if (active) setTimetableSet(saved); }).catch(() => undefined)
      .finally(() => { if (active) setRefreshKey((value) => value + 1); });
    return () => { active = false; };
  }, []));

  // 화면을 켜 둔 채 자정을 넘기거나 백그라운드에서 돌아오면 "오늘" 기준(강조·오늘로 가기)을 다시 계산한다
  useEffect(() => {
    const bump = () => setRefreshKey((value) => value + 1);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') bump(); });
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightBump = () => {
      timer = setTimeout(() => { bump(); scheduleMidnightBump(); }, msUntilNextLocalMidnight(new Date()));
    };
    scheduleMidnightBump();
    return () => { subscription.remove(); clearTimeout(timer); };
  }, []);

  const goToDay = (weekday: number) => { setSelectedDay(weekday); setWeekView(false); };

  const todayLabel = SCHOOL_WEEKDAYS.find(({ day }) => day === todayDay)?.label;
  // 오늘이 월~금이고 다른 요일을 보고 있을 때만 오늘로 돌아가는 버튼을 보여준다
  const canGoToday = todayLabel !== undefined && selectedDay !== todayDay;
  const weekHint = <Text style={[styles.hint, { color: colors.textMuted }]}>{WEEK_HINT}</Text>;
  // 어느 시간표를 보고 있는지 이름으로 알려 준다(예: 1학기, 여름방학)
  const setTitle = timetableSet ? `${timetableSet.name} 시간표` : '시간표';
  const toggle = <Pressable accessibilityRole="button" accessibilityLabel={weekView ? '요일별로 보기' : '주간 한눈에 보기'} onPress={() => setWeekView((value) => !value)} style={[styles.toggle, compact && styles.toggleCompact, { borderColor: colors.primary, backgroundColor: weekView ? colors.primary : colors.surface }]}>
    <Text style={{ color: weekView ? colors.onPrimary : colors.primary, fontWeight: '700' }}>{weekView ? '요일별로 보기' : '📅 주간 한눈에 보기'}</Text>
  </Pressable>;
  const card = <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    {timetableSet && <WeekOverviewGrid theme={theme} setId={timetableSet.id} today={todayDay} refreshKey={refreshKey} onSelectDay={goToDay} showHeader={!(compact && weekView)} />}
  </View>;

  // 가로 주간 보기: 어느 시간표인지·해제 버튼·요일 헤더는 스크롤 밖에 고정하고 표만 스크롤한다
  if (compact && weekView) {
    // 앱 헤더를 숨기면 상태 표시줄·화면 모서리(컷아웃)와 겹치므로 안전 영역만큼 띄운다
    return <View style={[styles.fixedRoot, { backgroundColor: colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.fixedTop}>
        <Text accessibilityRole="header" style={[styles.setTitle, { color: colors.text }]}>{setTitle}</Text>
        <View style={styles.fixedToggle}>{toggle}</View>
      </View>
      <View style={styles.fixedHeader}>
        <WeekDayHeader theme={theme} today={todayDay} onSelectDay={goToDay} />
        {weekHint}
      </View>
      <ScrollView contentContainerStyle={styles.fixedScroll}>{card}</ScrollView>
    </View>;
  }

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    {!compact && <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{setTitle}</Text>}
    {toggle}
    {weekView
      ? card
      : <>
          <WeekdayTabs selected={selectedDay} today={todayDay} theme={theme} onSelect={setSelectedDay} />
          {canGoToday && <Pressable accessibilityRole="button" accessibilityLabel={`오늘 ${todayLabel}요일로 가기`} onPress={() => setSelectedDay(todayDay)} style={[styles.todayButton, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>📍 오늘({todayLabel})로 가기</Text>
          </Pressable>}
          {timetableSet && <DailyScheduleList weekday={selectedDay} isToday={selectedDay === todayDay} theme={theme} setId={timetableSet.id} refreshKey={refreshKey} />}
        </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  heading: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  toggle: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg, width: '100%' },
  toggleCompact: { minHeight: 40 },
  hint: { fontSize: fontSize.sm, textAlign: 'center' },
  todayButton: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg, width: '100%' },
  fixedRoot: { flex: 1 },
  fixedTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  fixedToggle: { flex: 1 },
  setTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  // 표 카드의 좌우 여백(lg + md + 테두리 2)과 같게 맞춰 요일 헤더가 표 칸과 정렬되게 한다
  fixedHeader: { paddingHorizontal: spacing.lg + spacing.md + 2, paddingTop: spacing.xs },
  fixedScroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  card: { borderRadius: borderRadius.lg, borderWidth: 2, padding: spacing.md, width: '100%' },
});
