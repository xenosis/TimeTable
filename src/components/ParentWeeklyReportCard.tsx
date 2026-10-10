import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing } from '../theme/admin';
import { useNow } from '../hooks/useNow';
import { hasSyncedFamily } from '../sync/syncMarkers';
import { toLocalDateStr } from '../utils/date';
import { subscribeWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { dayLabel, gemWeekLine, loadWeeklyReport, weekSummaryLine, type WeeklyReport } from './parentWeeklyReport';

/**
 * 아빠 화면의 주간 리포트 카드(P8.4): 이번 주(월~일) 날짜별 할 일 진행과 완료율, 최근 4주 보석 변화.
 * 이 폰이 서버와 맞출 때마다(동기화 끝 신호·앱 복귀·날짜 바뀜) 다시 읽는다. 서버와 맞추기 전에는 비어 있는 이 폰 기록을 보이지 않는다.
 */
export function ParentWeeklyReportCard({ theme, familyId }: { readonly theme: ThemeDefinition; readonly familyId: string }) {
  const [loaded, setLoaded] = useState<{ familyId: string; day: string; value: WeeklyReport | null } | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const day = toLocalDateStr(useNow());
  const synced = hasSyncedFamily(familyId);
  // 새 가족이나 날짜를 읽는 동안 이전 가족의 집계를 표시하지 않는다.
  const report = loaded?.familyId === familyId && loaded.day === day ? loaded.value : undefined;

  useEffect(() => {
    if (!synced) return undefined;
    let active = true;
    void loadWeeklyReport().then((next) => { if (active) setLoaded({ familyId, day, value: next }); }).catch(() => { if (active) setLoaded({ familyId, day, value: null }); });
    return () => { active = false; };
  }, [familyId, synced, refreshKey, day]);
  useEffect(() => subscribeWidgetChecksApplied(refresh), [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const { colors } = theme;
  const muted = { color: colors.textMuted };
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>주간 리포트</Text>
    {!synced ? <Text style={[styles.body, muted]}>서버와 맞춘 뒤에 보여요.</Text>
      : report === undefined ? <Text style={[styles.body, muted]}>불러오는 중이에요.</Text>
      : report === null ? <Text style={[styles.body, muted]}>주간 리포트를 불러오지 못했어요.</Text>
      : <>
        <Text style={[styles.body, { color: colors.text }]}>{weekSummaryLine(report)}</Text>
        <View style={styles.days}>{report.days.map((item) => <Text key={item.date} style={[styles.day, { borderColor: colors.border, color: item.total > 0 && item.done === item.total ? colors.text : colors.textMuted }]}>{dayLabel(item)}</Text>)}</View>
        <Text style={[styles.subheading, { color: colors.text }]}>💎 주별 보석 변화</Text>
        {report.gemWeeks.map((week, index) => <Text key={week.weekStart} style={[styles.item, { color: index === report.gemWeeks.length - 1 ? colors.text : colors.textMuted }]}>{gemWeekLine(week, index === report.gemWeeks.length - 1)}</Text>)}
      </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.xs, padding: adminSpacing.md },
  heading: { fontSize: adminFontSize.title, fontWeight: '800' },
  subheading: { fontSize: adminFontSize.body, fontWeight: '700', marginTop: adminSpacing.xs },
  body: { fontSize: adminFontSize.body, lineHeight: 22 },
  item: { fontSize: adminFontSize.label, lineHeight: 20 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: adminSpacing.xs },
  day: { borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.label, paddingHorizontal: adminSpacing.xs, paddingVertical: 4 },
});
