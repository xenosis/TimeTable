import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { useNow } from '../hooks/useNow';
import { fontSize, spacing, type ThemeDefinition } from '../theme';
import { minutesOfDay } from '../utils/scheduleClock';
import { WeekTimeGrid } from './WeekTimeGrid';

/**
 * 요일별 보기: 주간표와 같은 시간축 표에서 고른 요일 한 칼럼만 크게 보여준다(그 요일에 집중해서 확대한 모습).
 * 지금 진행 중인 일정만 원래 색으로 강조한다(오늘이 아닌 요일도 같은 시각대를 보여준다). 요일은 위의 요일 탭에서 고르므로 표 안에 요일 헤더를 따로 두지 않는다.
 */
export function DailyScheduleList({ weekday, theme, setId, refreshKey }: {
  readonly weekday: number;
  readonly theme: ThemeDefinition;
  readonly setId: TimetableSetId;
  readonly refreshKey: number;
}) {
  const [items, setItems] = useState<readonly TimetableItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [areaHeight, setAreaHeight] = useState<number | undefined>(undefined);
  useNow(); // 매 분·앱 복귀 때 다시 그리게 한다
  const now = new Date(); // 다시 그릴 때마다 현재 시각을 새로 읽는다(요일 선택 즉시 반영)

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => getTimetableItemsForWeekday(database, weekday, setId)).then((saved) => {
      if (active) { setItems(saved); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [weekday, setId, refreshKey]);

  if (failed) return <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ 시간표를 불러오지 못했어요.</Text>;
  if (!items.length) return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>등록된 일정이 없어요.</Text>;
  const onArea = (event: LayoutChangeEvent) => setAreaHeight(event.nativeEvent.layout.height);
  return <View style={styles.wrap}>
    {/* 남은 화면 높이를 재서 표를 그 안에 맞춘다. 행이 너무 낮아지는 아주 많은 일정일 때만 스크롤된다 */}
    <View style={styles.area} onLayout={onArea}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 이 요일 하나만 넣어 행 경계도 이 요일의 시작·종료만 반영한다. today에 이 요일을 넣어 같은 시각대 강조(미리보기)를 켠다 */}
        <WeekTimeGrid theme={theme} days={[{ day: weekday, items }]} today={weekday} onSelectDay={() => undefined} nowMinutes={minutesOfDay(now)} focus showHeader={false} fitHeight={areaHeight} />
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: spacing.xs, width: '100%' },
  area: { flex: 1, width: '100%' },
  scroll: { flexGrow: 1 },
  empty: { fontSize: fontSize.md, textAlign: 'center' },
});
