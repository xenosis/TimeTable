import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods, type Period } from '../db/periodRepository';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableMode } from '../db/types';
import { borderRadius, fontSize, resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { makeWeeklyTimetable, type WeeklyTimetableData } from '../utils/weeklyTimetable';

const weekdays = [{ day: 0, label: '일' }, { day: 1, label: '월' }, { day: 2, label: '화' }, { day: 3, label: '수' }, { day: 4, label: '목' }, { day: 5, label: '금' }, { day: 6, label: '토' }] as const;
const periodLabelWidth = 44;
const gridPadding = spacing.md * 2;

function Chip({ items, theme, size }: { readonly items: readonly TimetableItem[]; readonly theme: ThemeDefinition; readonly size: number }) {
  if (!items.length) return <View style={[styles.cell, { width: size, height: size }]} />;
  const first = items[0];
  const category = resolveThemeColor(theme, first.colorKey);
  const icon = resolveThemeIcon(theme, first.iconKey);
  return <View style={[styles.cell, styles.chip, { width: size, height: size, backgroundColor: category.backgroundColor }]}>
    <Text style={[styles.chipGlyph, { color: category.textColor, fontSize: Math.max(12, size * 0.42) }]}>{icon.glyph}</Text>
    {items.length > 1 && <View style={[styles.moreDot, { backgroundColor: theme.colors.onPrimary }]} />}
  </View>;
}

export function WeekOverviewGrid({ theme, timetableMode, today, refreshKey, onSelectDay }: {
  readonly theme: ThemeDefinition;
  readonly timetableMode: TimetableMode;
  readonly today: number;
  readonly refreshKey: number;
  readonly onSelectDay: (weekday: number) => void;
}) {
  const { width } = useWindowDimensions();
  const [periods, setPeriods] = useState<readonly Period[]>([]);
  const [timetable, setTimetable] = useState<WeeklyTimetableData>({ periodItems: {}, timeOnlyItems: {} });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getDatabase().then(async (database) => {
      const savedPeriods = await getPeriods(database);
      const items = await Promise.all(weekdays.map(({ day }) => getTimetableItemsForWeekday(database, day, 'local-family', timetableMode)));
      return { savedPeriods, items };
    }).then(({ savedPeriods, items }) => {
      if (!active) return;
      setPeriods(savedPeriods);
      setTimetable(makeWeeklyTimetable(savedPeriods, items));
      setFailed(false);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [timetableMode, refreshKey]);

  const hasTimeOnlyItems = Object.values(timetable.timeOnlyItems).some((items) => items.length > 0);
  const cardWidth = width - gridPadding;
  const columnWidth = Math.max(32, (cardWidth - periodLabelWidth) / 7);

  if (failed) return <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ 주간 시간표를 불러오지 못했어요.</Text>;
  if (!periods.length && !hasTimeOnlyItems) return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>교시 시간을 먼저 설정해 주세요.</Text>;

  return <View>
    <View style={styles.headerRow}>
      <View style={{ width: periodLabelWidth }} />
      {weekdays.map(({ day, label }) => <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${label}요일 시간표로 이동`} onPress={() => onSelectDay(day)} style={[styles.dayHeader, { width: columnWidth }]}>
        <Text style={[styles.dayLabel, { color: day === today ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
      </Pressable>)}
    </View>
    {periods.map((period) => <View key={period.periodNo} style={styles.row}>
      <Text style={[styles.periodLabel, { color: theme.colors.textMuted, width: periodLabelWidth }]}>{period.periodNo}교시</Text>
      {weekdays.map(({ day }) => <Pressable key={day} onPress={() => onSelectDay(day)} accessibilityRole="button" accessibilityLabel={`${day}요일 ${period.periodNo}교시 보기`}>
        <Chip items={timetable.periodItems[day]?.get(period.periodNo) ?? []} theme={theme} size={columnWidth - spacing.xs} />
      </Pressable>)}
    </View>)}
    {hasTimeOnlyItems && <View style={styles.row}>
      <Text style={[styles.periodLabel, { color: theme.colors.textMuted, width: periodLabelWidth }]}>기타</Text>
      {weekdays.map(({ day }) => <Pressable key={day} onPress={() => onSelectDay(day)} accessibilityRole="button" accessibilityLabel={`${day}요일 기타 일정 보기`}>
        <Chip items={timetable.timeOnlyItems[day] ?? []} theme={theme} size={columnWidth - spacing.xs} />
      </Pressable>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: spacing.xs },
  dayHeader: { alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.xs },
  periodLabel: { fontSize: 12, fontWeight: '700' },
  cell: { alignItems: 'center', alignSelf: 'center', justifyContent: 'center' },
  chip: { borderRadius: borderRadius.sm },
  chipGlyph: { fontWeight: '700' },
  moreDot: { borderRadius: 3, bottom: 3, height: 6, position: 'absolute', right: 3, width: 6 },
  empty: { fontSize: fontSize.md, textAlign: 'center' },
});
