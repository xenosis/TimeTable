import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableMode } from '../db/types';
import { borderRadius, fontSize, resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { SCHOOL_WEEKDAYS } from '../utils/weekdays';

type DayColumn = { readonly day: number; readonly items: readonly TimetableItem[] };

function ItemRow({ item, theme }: { readonly item: TimetableItem; readonly theme: ThemeDefinition }) {
  const category = resolveThemeColor(theme, item.colorKey);
  const icon = resolveThemeIcon(theme, item.iconKey);
  return <View style={[styles.itemRow, { backgroundColor: category.backgroundColor }]}>
    <Text style={[styles.itemTime, { color: category.textColor }]}>{item.startTime}</Text>
    <Text style={[styles.itemTitle, { color: category.textColor }]} numberOfLines={2}>{icon.glyph} {item.title}</Text>
  </View>;
}

export function WeekOverviewGrid({ theme, timetableMode, today, refreshKey, onSelectDay }: {
  readonly theme: ThemeDefinition;
  readonly timetableMode: TimetableMode;
  readonly today: number;
  readonly refreshKey: number;
  readonly onSelectDay: (weekday: number) => void;
}) {
  const [columns, setColumns] = useState<readonly DayColumn[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => Promise.all(
      SCHOOL_WEEKDAYS.map(({ day }) => getTimetableItemsForWeekday(database, day, 'local-family', timetableMode).then((items) => ({ day, items }))),
    )).then((result) => { if (active) { setColumns(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [timetableMode, refreshKey]);

  const hasAnyItem = columns.some(({ items }) => items.length > 0);

  if (failed) return <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ 주간 시간표를 불러오지 못했어요.</Text>;
  if (columns.length && !hasAnyItem) return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>등록된 일정이 없어요.</Text>;

  return <View style={styles.grid}>
    {columns.map(({ day, items }) => {
      const label = SCHOOL_WEEKDAYS.find((weekday) => weekday.day === day)?.label ?? '';
      return <View key={day} style={styles.column}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}요일 시간표로 이동`} onPress={() => onSelectDay(day)} style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: day === today ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
        </Pressable>
        {items.length
          ? items.map((item) => <Pressable key={item.id} onPress={() => onSelectDay(day)}><ItemRow item={item} theme={theme} /></Pressable>)
          : <Text style={[styles.emptyDay, { color: theme.colors.textMuted }]}>-</Text>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.xs, width: '100%' },
  column: { flex: 1, gap: spacing.xs },
  dayHeader: { alignItems: 'center', paddingBottom: spacing.xs },
  dayLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  itemRow: { alignItems: 'center', borderRadius: borderRadius.sm, minHeight: 40, paddingHorizontal: 4, paddingVertical: 4 },
  itemTime: { fontSize: 10, fontWeight: '700' },
  itemTitle: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  emptyDay: { fontSize: fontSize.sm, textAlign: 'center' },
  empty: { fontSize: fontSize.md, textAlign: 'center' },
});
