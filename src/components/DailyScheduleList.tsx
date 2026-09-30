import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { borderRadius, fontSize, resolveThemeColor, resolveThemeIcon, spacing, type ThemeDefinition } from '../theme';

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

type ItemState = 'past' | 'current' | 'upcoming';

function ScheduleRow({ item, state, theme }: { readonly item: TimetableItem; readonly state: ItemState; readonly theme: ThemeDefinition }) {
  const category = resolveThemeColor(theme, item.colorKey);
  const icon = resolveThemeIcon(theme, item.iconKey);
  const dimmed = state === 'past';
  return <View style={[styles.row, { backgroundColor: dimmed ? theme.colors.surface : category.backgroundColor, borderColor: state === 'current' ? theme.colors.primary : 'transparent', opacity: dimmed ? 0.55 : 1 }]}>
    <Text style={[styles.icon, { color: dimmed ? theme.colors.textMuted : category.textColor }]}>{icon.glyph}</Text>
    <View style={styles.copy}>
      <Text style={[styles.title, { color: dimmed ? theme.colors.textMuted : category.textColor }]}>{item.title}</Text>
      <Text style={[styles.time, { color: dimmed ? theme.colors.textMuted : category.textColor }]}>{item.startTime} ~ {item.endTime}</Text>
    </View>
    {state === 'current' && <Text style={[styles.badge, { color: theme.colors.primary }]}>지금</Text>}
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
  const [nowMinutes, setNowMinutes] = useState(() => { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); });

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => getTimetableItemsForWeekday(database, weekday, setId)).then((saved) => {
      if (active) { setItems(saved); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [weekday, setId, refreshKey]);

  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => { const now = new Date(); setNowMinutes(now.getHours() * 60 + now.getMinutes()); }, 30_000);
    return () => clearInterval(interval);
  }, [isToday]);

  const stateOf = (item: TimetableItem): ItemState => {
    if (!isToday) return 'upcoming';
    if (nowMinutes >= toMinutes(item.endTime)) return 'past';
    if (nowMinutes >= toMinutes(item.startTime)) return 'current';
    return 'upcoming';
  };

  if (failed) return <Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ 시간표를 불러오지 못했어요.</Text>;
  if (!items.length) return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>등록된 일정이 없어요.</Text>;
  return <View style={styles.list}>{items.map((item) => <ScheduleRow key={item.id} item={item} state={stateOf(item)} theme={theme} />)}</View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, width: '100%' },
  row: { alignItems: 'center', borderRadius: borderRadius.lg, borderWidth: 3, flexDirection: 'row', gap: spacing.md, minHeight: 72, padding: spacing.md },
  icon: { fontSize: 28, fontWeight: '700' },
  copy: { flex: 1 },
  title: { fontSize: fontSize.md, fontWeight: '700' },
  time: { fontSize: fontSize.sm },
  badge: { fontSize: fontSize.sm, fontWeight: '700' },
  empty: { fontSize: fontSize.md, textAlign: 'center' },
});
