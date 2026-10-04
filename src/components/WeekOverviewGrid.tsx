import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { useNow } from '../hooks/useNow';
import { fontSize, type ThemeDefinition } from '../theme';
import { minutesOfDay } from '../utils/scheduleClock';
import type { GridDay } from '../utils/timetableGrid';
import { SCHOOL_WEEKDAYS } from '../utils/weekdays';
import { WeekTimeGrid } from './WeekTimeGrid';

export function WeekOverviewGrid({ theme, setId, today, refreshKey, onSelectDay, showHeader = true }: {
  readonly theme: ThemeDefinition;
  readonly setId: TimetableSetId;
  readonly today: number;
  readonly refreshKey: number;
  readonly onSelectDay: (weekday: number) => void;
  readonly showHeader?: boolean;
}) {
  const [days, setDays] = useState<readonly GridDay<TimetableItem>[]>([]);
  const [failed, setFailed] = useState(false);
  useNow(); // 매 분·앱 복귀 때 다시 그리게 한다
  const now = new Date(); // 다시 그릴 때마다 현재 시각을 새로 읽는다

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => Promise.all(
      SCHOOL_WEEKDAYS.map(({ day }) => getTimetableItemsForWeekday(database, day, setId).then((items) => ({ day, items }))),
    )).then((result) => { if (active) { setDays(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [setId, refreshKey]);

  const hasAnyItem = days.some(({ items }) => items.length > 0);

  if (failed) return <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center' }}>⚠️ 주간 시간표를 불러오지 못했어요.</Text>;
  if (days.length && !hasAnyItem) return <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.md, textAlign: 'center' }}>등록된 일정이 없어요.</Text>;

  return <WeekTimeGrid theme={theme} days={days} today={today} onSelectDay={onSelectDay} showHeader={showHeader} nowMinutes={minutesOfDay(now)} />;
}
