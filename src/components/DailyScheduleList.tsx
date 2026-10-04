import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { useNow } from '../hooks/useNow';
import { borderRadius, fontSize, resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { formatNow, lightenColor, minutesOfDay, scheduleStatus } from '../utils/scheduleClock';


/** 지금 진행 중인 항목만 원래 과목색·테두리·'지금' 표시로 보여주고, 나머지는 같은 색을 연하게 보여준다(색만으로 구분하지 않는다). */
function ScheduleRow({ item, current, preview, theme }: { readonly item: TimetableItem; readonly current: boolean; readonly preview: boolean; readonly theme: ThemeDefinition }) {
  const category = resolveThemeColor(theme, item.colorKey);
  const icon = resolveThemeIcon(theme, item.iconKey);
  const textColor = current ? category.textColor : theme.colors.text;
  return <View accessibilityLabel={current ? `${item.title}, ${preview ? '지금 시각과 같은 시간대' : '지금 진행 중'}` : undefined} style={[styles.row, { backgroundColor: current ? category.backgroundColor : lightenColor(category.backgroundColor, 0.78), borderColor: current ? theme.colors.text : 'transparent' }]}>
    <Text style={[styles.icon, { color: textColor }]}>{icon.glyph}</Text>
    <View style={styles.copy}>
      <Text style={[styles.title, { color: textColor }]}>{item.title}</Text>
      <Text style={[styles.time, { color: textColor }]}>{item.startTime} ~ {item.endTime}</Text>
      {!!item.memo && <Text style={[styles.memo, { color: textColor }]} numberOfLines={1}>📝 {item.memo}</Text>}
    </View>
    {current && <Text style={[styles.badge, { color: textColor }]}>{preview ? '이 시각' : '지금'}</Text>}
  </View>;
}

export function DailyScheduleList({ weekday, isToday, theme, setId, refreshKey }: {
  readonly weekday: number;
  readonly isToday: boolean;
  readonly theme: ThemeDefinition;
  readonly setId: TimetableSetId;
  readonly refreshKey: number;
}) {
  const [items, setItems] = useState<readonly TimetableItem[]>([]);
  const [failed, setFailed] = useState(false);
  // 요일을 고르는 즉시 기기의 현재 시각으로 판단한다. 오늘이 아닌 요일은 같은 시각대를 미리 보여주는 것이다.
  useNow(); // 매 분·앱 복귀 때 다시 그리게 한다
  const now = new Date(); // 다시 그릴 때마다 현재 시각을 새로 읽는다(요일 선택 즉시 반영)
  const nowMinutes = minutesOfDay(now);

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => getTimetableItemsForWeekday(database, weekday, setId)).then((saved) => {
      if (active) { setItems(saved); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [weekday, setId, refreshKey]);

  if (failed) return <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ 시간표를 불러오지 못했어요.</Text>;
  if (!items.length) return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>등록된 일정이 없어요.</Text>;
  return <View style={styles.list}>
    {!isToday && <Text style={[styles.preview, { color: theme.colors.textMuted }]}>{`오늘이 아닌 요일이에요. 지금 시각(${formatNow(now)})에 해당하는 시간대를 미리 보여줘요.`}</Text>}
    {items.map((item) => <ScheduleRow key={item.id} item={item} current={scheduleStatus(item.startTime, item.endTime, nowMinutes) === 'current'} preview={!isToday} theme={theme} />)}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs, width: '100%' },
  row: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  icon: { fontSize: 24, fontWeight: '700' },
  copy: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  time: { fontSize: 14 },
  memo: { fontSize: 14 },
  preview: { fontSize: fontSize.sm, textAlign: 'center' },
  badge: { fontSize: fontSize.sm, fontWeight: '700' },
  empty: { fontSize: fontSize.md, textAlign: 'center' },
});
