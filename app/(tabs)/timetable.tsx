import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyScheduleList } from '../../src/components/DailyScheduleList';
import { CharacterHeader } from '../../src/components/CharacterHeader';
import { WeekdayTabs } from '../../src/components/WeekdayTabs';
import { WeekOverviewGrid } from '../../src/components/WeekOverviewGrid';
import { WeekDayHeader } from '../../src/components/WeekTimeGrid';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableSet } from '../../src/db/timetableSetRepository';
import type { TimetableSet } from '../../src/db/types';
import { setImmersive } from '../../src/store/immersiveMode';
import { borderRadius, fontSize, spacing } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { msUntilNextLocalMidnight } from '../../src/utils/date';
import { defaultSchoolWeekday, SCHOOL_WEEKDAYS } from '../../src/utils/weekdays';

const today = () => new Date().getDay();

export default function TimetableScreen() {
  const todayDay = today();
  const { theme } = useActiveTheme();
  const focused = useIsFocused(); // 다른 탭에 가 있는 동안에는 현재 시각 갱신 타이머를 멈춘다
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
  // 오늘이 월~금이고, 오늘 요일 화면을 이미 보고 있는 게 아닐 때만 눌 수 있다(주간 보기에서는 오늘 요일로 이동)
  const canGoToday = todayLabel !== undefined && (weekView || selectedDay !== todayDay);
  // 어느 시간표를 보고 있는지 이름으로 알려 준다(예: 1학기, 여름방학)
  const setTitle = timetableSet ? `${timetableSet.name} 시간표` : '시간표';
  const toggleColor = weekView ? colors.onPrimary : colors.primary;
  const buttons = <View style={styles.buttonRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={weekView ? '요일별로 보기' : '주간 한눈에 보기'} onPress={() => setWeekView((value) => !value)} style={[styles.button, { borderColor: colors.primary, backgroundColor: weekView ? colors.primary : colors.surface }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.buttonText, { color: toggleColor }]}>{weekView ? '요일별로 보기' : '📅 주간 한눈에 보기'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canGoToday }} accessibilityLabel={todayLabel ? `오늘 ${todayLabel}요일로 가기` : '오늘은 시간표가 없는 날이에요'} disabled={!canGoToday} onPress={() => goToDay(todayDay)} style={[styles.button, { borderColor: colors.primary, backgroundColor: colors.surface }, !canGoToday && styles.disabled]}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.buttonText, { color: colors.primary }]}>{todayLabel ? `📍 오늘(${todayLabel})로 가기` : '📍 오늘로 가기'}</Text>
    </Pressable>
  </View>;
  const card = <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    {timetableSet && <WeekOverviewGrid theme={theme} setId={timetableSet.id} today={todayDay} refreshKey={refreshKey} onSelectDay={goToDay} showHeader={!(compact && weekView)} active={focused} />}
  </View>;

  // 가로 주간 보기: 어느 시간표인지·해제 버튼·요일 헤더는 스크롤 밖에 고정하고 표만 스크롤한다
  if (compact && weekView) {
    // 앱 헤더를 숨기면 상태 표시줄·화면 모서리(컷아웃)와 겹치므로 안전 영역만큼 띄운다
    return <View style={[styles.fixedRoot, { backgroundColor: colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.fixedTop}>
        <Text accessibilityRole="header" style={[styles.setTitle, { color: colors.text }]}>{setTitle}</Text>
        <View style={styles.fixedToggle}>{buttons}</View>
      </View>
      <View style={styles.fixedHeader}>
        <WeekDayHeader theme={theme} today={todayDay} onSelectDay={goToDay} />
      </View>
      <ScrollView contentContainerStyle={styles.fixedScroll}>{card}</ScrollView>
    </View>;
  }

  // 요일 확대 보기는 스크롤 없이 남은 화면에 표를 맞춘다(DailyScheduleList가 높이를 재서 행 높이를 조절한다)
  if (!weekView) {
    return <View style={[styles.dayRoot, { backgroundColor: colors.background }]}>
      {!compact && <CharacterHeader theme={theme} compact><Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{setTitle}</Text></CharacterHeader>}
      {buttons}
      <WeekdayTabs selected={selectedDay} today={todayDay} theme={theme} onSelect={setSelectedDay} />
      {timetableSet && <DailyScheduleList weekday={selectedDay} isToday={selectedDay === todayDay} active={focused} theme={theme} setId={timetableSet.id} refreshKey={refreshKey} />}
    </View>;
  }

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    {!compact && <CharacterHeader theme={theme} compact><Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{setTitle}</Text></CharacterHeader>}
    {buttons}
    {card}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.sm, padding: spacing.md },
  dayRoot: { alignItems: 'center', flex: 1, gap: spacing.sm, padding: spacing.md },
  heading: { fontSize: fontSize.md, fontWeight: '700', textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  button: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.sm },
  buttonText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  fixedRoot: { flex: 1 },
  fixedTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  fixedToggle: { flex: 1 },
  setTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  // 표 카드의 좌우 여백(lg + md + 테두리 2)과 같게 맞춰 요일 헤더가 표 칸과 정렬되게 한다
  fixedHeader: { paddingHorizontal: spacing.lg + spacing.sm + 2, paddingTop: spacing.xs },
  fixedScroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  card: { borderRadius: borderRadius.md, borderWidth: 2, padding: spacing.sm, width: '100%' },
});
