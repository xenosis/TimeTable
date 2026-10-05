import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getTimetableItemsForWeekday, type TimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { resolveThemeColor, resolveThemeIcon, type ThemeDefinition } from '../theme';
import { borderRadius, fontSize, spacing } from '../theme';
import { getTodaySchedule } from '../utils/todaySchedule';

function ScheduleItemCard({ label, item, theme }: { readonly label: string; readonly item: TimetableItem; readonly theme: ThemeDefinition }) {
  const category = resolveThemeColor(theme, item.colorKey);
  const icon = resolveThemeIcon(theme, item.iconKey);
  const current = label === '지금';
  const foreground = current ? category.textColor : theme.colors.text;
  return <View style={[styles.item, { backgroundColor: current ? category.backgroundColor : theme.colors.background }]}>
    <View style={[styles.iconBadge, { backgroundColor: category.backgroundColor }]}><Text style={[styles.icon, { color: category.textColor }]}>{icon.glyph}</Text></View>
    <View style={styles.copy}>
      <Text style={[styles.label, { color: foreground }]}>{current ? '지금 하고 있어요' : '다음 일정'}</Text>
      <Text style={[styles.itemTitle, { color: foreground }]}>{item.title}</Text>
      <Text style={[styles.itemTime, { color: foreground }]}>{item.startTime} – {item.endTime}</Text>
      {!!item.memo && <Text style={[styles.itemMemo, { color: foreground }]}>📝 {item.memo}</Text>}
    </View>
  </View>;
}

/** The child slot keeps the task checklist before the expandable additional schedule. */
export function TodayScheduleCard({ refreshKey, theme, setId, children }: PropsWithChildren<{ readonly refreshKey: number; readonly theme: ThemeDefinition; readonly setId: TimetableSetId | null }>) {
  const [items, setItems] = useState<readonly TimetableItem[]>([]);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [failedRequestKey, setFailedRequestKey] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const now = new Date();
  const [message, setMessage] = useState('오늘 일정을 불러오는 중이에요.');
  const weekday = now.getDay();
  const [retryKey, setRetryKey] = useState(0);
  // 같은 요일·세트의 새로고침(체크·앱 복귀)에서는 이전 일정을 유지해 카드가 깜빡이지 않게 한다
  const identity = `${weekday}:${setId}:`;
  const requestKey = `${identity}${refreshKey}:${retryKey}`;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}:${setId}`;
  const expanded = expandedKey === dayKey;


  useEffect(() => {
    const interval = setInterval(() => setClockTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (setId === null) return;
    let active = true;
    void getDatabase().then((database) => getTimetableItemsForWeekday(database, weekday, setId)).then((saved) => {
      if (!active) return;
      setItems(saved);
      setLoadedRequestKey(requestKey);
      setFailedRequestKey(null);
      setMessage(saved.length ? '' : '오늘은 등록된 일정이 없어요.');
    }).catch(() => {
      if (active) {
        // 실패 뒤 재시도 응답 전에 실패 전 일정이 다시 보이지 않게 이전 결과를 버린다
        setLoadedRequestKey(null);
        setFailedRequestKey(requestKey);
        setMessage('오늘 일정을 불러오지 못했어요.');
      }
    });
    return () => { active = false; };
  }, [weekday, refreshKey, setId, requestKey]);

  const failed = failedRequestKey === requestKey;
  const sameIdentityLoaded = loadedRequestKey?.startsWith(identity) ?? false;
  const readyItems = setId !== null && !failed && sameIdentityLoaded ? items : [];
  const { current, next, minutesUntilNext } = getTodaySchedule(readyItems, now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const additional = failed ? [] : readyItems.filter((item) => item.endTime > time && item.id !== current?.id && item.id !== next?.id).sort((left, right) => left.startTime.localeCompare(right.startTime));
  const emptyMessage = failed ? message : !sameIdentityLoaded ? '오늘 일정을 불러오는 중이에요.' : readyItems.length ? '오늘 일정이 끝났어요.' : message;

  return <>{setId !== null && <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>지금 · 다음 일정</Text>
    {current && <ScheduleItemCard label="지금" item={current} theme={theme} />}
    {next && <ScheduleItemCard label="다음" item={next} theme={theme} />}
    {failed && <><Text style={[styles.empty, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ {message}</Text><Pressable accessibilityRole="button" accessibilityLabel="일정 다시 불러오기" onPress={() => setRetryKey((value) => value + 1)} style={styles.retry}><Text style={{ color: theme.colors.primary }}>다시 불러오기</Text></Pressable></>}
    {!failed && !current && !next && <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{emptyMessage}</Text>}
    {next && <Text style={[styles.next, { color: theme.colors.textMuted }]}>다음 일정까지 {minutesUntilNext}분 남았어요.</Text>}
  </View>}
    {children}
    {!!additional.length && <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`다른 남은 일정 ${additional.length}개 ${expanded ? '접기' : '펼치기'}`} onPress={() => setExpandedKey(expanded ? null : dayKey)} style={styles.expand}>
        <Text style={[styles.moreTitle, { color: theme.colors.text }]}>다른 남은 일정 {additional.length}개</Text>
        <Text style={{ color: theme.colors.primary }}>{expanded ? '접기 ▲' : '펼치기 ▼'}</Text>
      </Pressable>
      {expanded && additional.map((item) => <View key={item.id} style={[styles.moreRow, { borderTopColor: theme.colors.border }]}>
        <Text style={[styles.moreTime, { color: theme.colors.textMuted }]}>{item.startTime} – {item.endTime}</Text>
        <Text style={[styles.moreTitle, { color: theme.colors.text }]}>{item.title}</Text>
        {!!item.memo && <Text style={[styles.itemMemo, { color: theme.colors.textMuted }]}>📝 {item.memo}</Text>}
      </View>)}
    </View>}
  </>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 1, gap: 8, padding: 14, width: '100%' },
  heading: { fontSize: 16, fontWeight: '800' },
  item: { alignItems: 'center', borderRadius: borderRadius.md, flexDirection: 'row', gap: spacing.sm, minHeight: 72, padding: 10 },
  iconBadge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 19, fontWeight: '700' }, copy: { flex: 1, gap: 2 }, label: { fontSize: 12, fontWeight: '700' }, itemTitle: { fontSize: 17, fontWeight: '800' }, itemTime: { fontSize: 15, fontVariant: ['tabular-nums'] }, itemMemo: { fontSize: 15 },
  empty: { fontSize: 13 }, next: { fontSize: fontSize.sm },
  expand: { minHeight: 56, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  moreTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 }, moreTime: { fontSize: 12, fontVariant: ['tabular-nums'] },
  moreRow: { borderTopWidth: 1, gap: 4, paddingVertical: 10 },
  retry: { minHeight: 56, justifyContent: 'center' },
});
