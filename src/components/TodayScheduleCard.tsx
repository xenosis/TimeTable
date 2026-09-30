import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { resolveThemeColor, resolveThemeIcon, type ThemeDefinition } from '../theme';
import { borderRadius, fontSize, spacing } from '../theme';
import { getTodaySchedule } from '../utils/todaySchedule';

function ScheduleItemCard({ label, item, theme }: { readonly label: string; readonly item: TimetableItem; readonly theme: ThemeDefinition }) {
  const category = resolveThemeColor(theme, item.colorKey);
  const icon = resolveThemeIcon(theme, item.iconKey);
  return <View style={[styles.item, { backgroundColor: category.backgroundColor }]}>
    <Text style={[styles.icon, { color: category.textColor }]}>{icon.glyph}</Text>
    <View style={styles.copy}>
      <Text style={[styles.itemTitle, { color: category.textColor }]}>{label} {item.title}</Text>
      <Text style={[styles.itemTime, { color: category.textColor }]}>{item.startTime} ~ {item.endTime}</Text>
    </View>
  </View>;
}

export function TodayScheduleCard({ refreshKey, theme, setId }: { readonly refreshKey: number; readonly theme: ThemeDefinition; readonly setId: TimetableSetId }) {
  const [items, setItems] = useState<readonly TimetableItem[]>([]);
  const [loadedWeekday, setLoadedWeekday] = useState<number | null>(null);
  const [loadedRefreshKey, setLoadedRefreshKey] = useState<number | null>(null);
  const [failedWeekday, setFailedWeekday] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState('오늘 일정을 불러오는 중이에요.');
  const weekday = now.getDay();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => getTimetableItemsForWeekday(database, weekday, setId)).then((saved) => {
      if (!active) return;
      setItems(saved);
      setLoadedWeekday(weekday);
      setLoadedRefreshKey(refreshKey);
      setFailedWeekday(null);
      setMessage(saved.length ? '' : '오늘은 등록된 일정이 없어요.');
    }).catch(() => {
      if (active) {
        setFailedWeekday(weekday);
        setMessage('오늘 일정을 불러오지 못했어요.');
      }
    });
    return () => { active = false; };
  }, [weekday, refreshKey, setId]);

  const readyItems = loadedWeekday === weekday && loadedRefreshKey === refreshKey ? items : [];
  const { current, next, minutesUntilNext } = getTodaySchedule(readyItems, now);
  const emptyMessage = failedWeekday === weekday ? message : loadedWeekday !== weekday ? '오늘 일정을 불러오는 중이에요.' : readyItems.length ? '오늘 일정이 끝났어요.' : message;

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>오늘의 시간표</Text>
    {current && <ScheduleItemCard label="지금" item={current} theme={theme} />}
    {next && <ScheduleItemCard label="다음" item={next} theme={theme} />}
    {failedWeekday === weekday && <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ {message}</Text>}
    {!current && !next && <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{emptyMessage}</Text>}
    {next && <Text style={[styles.next, { color: theme.colors.textMuted }]}>다음 일정까지 {minutesUntilNext}분 남았어요.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: spacing.lg, width: '100%' },
  heading: { fontSize: fontSize.lg, fontWeight: '700' },
  item: { alignItems: 'center', borderRadius: borderRadius.md, flexDirection: 'row', gap: spacing.md, minHeight: 96, padding: spacing.md },
  icon: { fontSize: 32, fontWeight: '700' }, copy: { flex: 1 }, itemTitle: { fontSize: fontSize.lg, fontWeight: '700' }, itemTime: { fontSize: fontSize.md },
  empty: { fontSize: fontSize.md }, next: { fontSize: fontSize.sm },
});
