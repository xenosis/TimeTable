import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getScheduleForDate, holidayLine, upcomingDateForWeekday } from '../db/dateSchedule';
import type { TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { useNow } from '../hooks/useNow';
import { fontSize, type ThemeDefinition } from '../theme';
import { minutesOfDay } from '../utils/scheduleClock';
import type { GridDay } from '../utils/timetableGrid';
import { SCHOOL_WEEKDAYS } from '../utils/weekdays';
import { WeekTimeGrid } from './WeekTimeGrid';

export function WeekOverviewGrid({ theme, setId, today, refreshKey, onSelectDay, showHeader = true, active = true }: {
  readonly theme: ThemeDefinition;
  readonly setId: TimetableSetId;
  readonly today: number;
  readonly refreshKey: number;
  readonly onSelectDay: (weekday: number) => void;
  readonly showHeader?: boolean;
  /** 화면이 보이는 동안만 1분 타이머를 돌린다 */
  readonly active?: boolean;
}) {
  const [days, setDays] = useState<readonly GridDay<TimetableItem>[]>([]);
  const [failed, setFailed] = useState(false);
  const [holidays, setHolidays] = useState<readonly string[]>([]);
  useNow(active); // 매 분·앱 복귀 때 다시 그리게 한다(화면이 보일 때만)
  const now = new Date(); // 다시 그릴 때마다 현재 시각을 새로 읽는다

  useEffect(() => {
    let active = true;
    // 각 요일은 오늘부터 7일 안의 그 날짜를 가리킨다. 쉬는 날(공휴일)이면 그 칸은 비우고 위에 안내한다(P8.8)
    void getDatabase().then((database) => Promise.all(
      SCHOOL_WEEKDAYS.map(({ day }) => getScheduleForDate(database, upcomingDateForWeekday(new Date(), day), setId).then((schedule) => ({ day, schedule }))),
    )).then((result) => {
      if (!active) return;
      setDays(result.map(({ day, schedule }) => ({ day, items: schedule.items })));
      setHolidays(result.flatMap(({ schedule }) => (schedule.dayOff ? [{ date: schedule.date, dayOff: schedule.dayOff }] : [])).sort((a, b) => a.date.localeCompare(b.date)).map(holidayLine));
      setFailed(false);
    })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [setId, refreshKey]);

  const hasAnyItem = days.some(({ items }) => items.length > 0);

  if (failed) return <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center' }}>⚠️ 주간 시간표를 불러오지 못했어요.</Text>;
  const holidayNote = holidays.length > 0 && <Text style={{ color: theme.colors.text, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' }}>🎉 {holidays.join(' · ')}</Text>;
  if (days.length && !hasAnyItem) return <View>{holidayNote}<Text style={{ color: theme.colors.textMuted, fontSize: fontSize.md, textAlign: 'center' }}>등록된 일정이 없어요.</Text></View>;

  return <>{holidayNote}<WeekTimeGrid theme={theme} days={days} today={today} onSelectDay={onSelectDay} showHeader={showHeader} nowMinutes={minutesOfDay(now)} /></>;
}
