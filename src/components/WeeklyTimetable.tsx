import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods, type Period } from '../db/periodRepository';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableMode } from '../db/types';
import { borderRadius, fontSize, resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';
import { makeWeeklyTimetable, type WeeklyTimetableData } from '../utils/weeklyTimetable';

const weekdays = [{ day: 0, label: '일' }, { day: 1, label: '월' }, { day: 2, label: '화' }, { day: 3, label: '수' }, { day: 4, label: '목' }, { day: 5, label: '금' }, { day: 6, label: '토' }] as const;
const itemHeight = 52;

function Cell({ items, theme, height }: { readonly items: readonly TimetableItem[]; readonly theme: ThemeDefinition; readonly height: number }) {
  if (!items.length) return <View style={[styles.cell, { borderColor: theme.colors.border, height }]}><Text style={{ color: theme.colors.textMuted }}>-</Text></View>;
  return <View style={[styles.cell, { borderColor: theme.colors.border, height }]}>{items.map((item) => {
    const color = resolveThemeColor(theme, item.colorKey);
    const icon = resolveThemeIcon(theme, item.iconKey);
    return <View key={item.id} style={[styles.item, { backgroundColor: color.backgroundColor }]}><Text style={[styles.icon, { color: color.textColor }]}>{icon.glyph}</Text><Text numberOfLines={1} style={[styles.title, { color: color.textColor }]}>{item.title}</Text>{item.periodNo == null && <Text style={[styles.clock, { color: color.textColor }]}>{item.startTime}</Text>}</View>;
  })}</View>;
}

function RowLabel({ label, detail, height, theme }: { readonly label: string; readonly detail?: string; readonly height: number; readonly theme: ThemeDefinition }) {
  return <View style={[styles.time, { borderColor: theme.colors.border, height }]}><Text style={[styles.period, { color: theme.colors.text }]}>{label}</Text>{detail && <Text style={[styles.clock, { color: theme.colors.textMuted }]}>{detail}</Text>}</View>;
}

function Table({ periods, timetable, theme }: { readonly periods: readonly Period[]; readonly timetable: WeeklyTimetableData; readonly theme: ThemeDefinition }) {
  const periodHeights = periods.map((period) => Math.max(96, ...weekdays.map(({ day }) => (timetable.periodItems[day]?.get(period.periodNo)?.length ?? 0) * itemHeight)));
  const timeOnlyHeight = Math.max(96, ...weekdays.map(({ day }) => (timetable.timeOnlyItems[day]?.length ?? 0) * itemHeight));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.table}>
    <View style={styles.timeColumn}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>교시</Text></View>
      {periods.map((period, index) => <RowLabel key={period.periodNo} label={`${period.periodNo}교시`} detail={`${period.startTime}\n${period.endTime}`} height={periodHeights[index]} theme={theme} />)}
      <RowLabel label="시간 지정" height={timeOnlyHeight} theme={theme} />
    </View>
    {weekdays.map(({ day, label }) => <View key={label} style={styles.dayColumn}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.day, { color: theme.colors.text }]}>{label}</Text></View>
      {periods.map((period, index) => <Cell key={period.periodNo} items={timetable.periodItems[day]?.get(period.periodNo) ?? []} theme={theme} height={periodHeights[index]} />)}
      <Cell items={timetable.timeOnlyItems[day] ?? []} theme={theme} height={timeOnlyHeight} />
    </View>)}
  </ScrollView>;
}

export function WeeklyTimetable({ refreshKey, theme, timetableMode }: { readonly refreshKey: number; readonly theme: ThemeDefinition; readonly timetableMode: TimetableMode }) {
  const [periods, setPeriods] = useState<readonly Period[]>([]);
  const [timetable, setTimetable] = useState<WeeklyTimetableData>({ periodItems: {}, timeOnlyItems: {} });
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('시간표를 불러오는 중이에요.');

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
      setStatus(savedPeriods.length ? '' : '교시 시간을 먼저 설정해 주세요.');
    }).catch(() => { if (active) { setFailed(true); setStatus('주간 시간표를 불러오지 못했어요.'); } });
    return () => { active = false; };
  }, [refreshKey, timetableMode]);

  const hasTimeOnlyItems = Object.values(timetable.timeOnlyItems).some((items) => items.length > 0);
  const showTable = periods.length > 0 || hasTimeOnlyItems;

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>주간 시간표</Text>
    {failed && <Text style={[styles.status, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ {status}</Text>}
    {showTable ? <Table periods={periods} timetable={timetable} theme={theme} /> : !failed && <Text style={{ color: theme.colors.textMuted }}>{status}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, paddingVertical: spacing.lg, width: '100%' },
  heading: { fontSize: fontSize.lg, fontWeight: '700', paddingHorizontal: spacing.lg }, table: { paddingHorizontal: spacing.lg }, timeColumn: { width: 86 }, dayColumn: { width: 100 },
  header: { alignItems: 'center', borderWidth: 1, height: 48, justifyContent: 'center' }, day: { fontSize: fontSize.md, fontWeight: '700' },
  time: { borderWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.xs }, period: { fontSize: fontSize.sm, fontWeight: '700' }, clock: { fontSize: 12 },
  cell: { borderWidth: 1, justifyContent: 'center', padding: 2 }, item: { alignItems: 'center', borderRadius: borderRadius.sm, flexDirection: 'row', gap: 2, minHeight: 48, paddingHorizontal: 2 }, icon: { fontSize: 20 }, title: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' }, status: { fontSize: fontSize.sm, paddingHorizontal: spacing.lg },
});
