import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { fetchChildDeviceStatus } from '../server/childDeviceStatus';
import { hasSyncedFamily, lastAdminEditAt, lastSyncedAt } from '../sync/syncMarkers';
import { subscribeWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { childSyncLine, loadParentOverview, stickerLine, taskProgressLine, type ParentOverview, type Remote } from './parentOverview';
import { useNow } from '../hooks/useNow';
import { toLocalDateStr } from '../utils/date';
import { runSync } from '../sync/syncRunner';
import { formatSyncTime, useSyncStatus } from '../sync/syncStatus';

const REMOTE_REFRESH_MS = 30_000;

/**
 * 아빠 화면의 딸 현황 카드(P6.8): 오늘 할 일 완료 현황, 보석, 딸 폰 마지막 동기화 시각.
 * 이 폰이 서버와 맞출 때마다(앱 복귀·Realtime 신호) 다시 읽고, '새로 보기'로 직접 다시 읽을 수도 있다.
 */
export function ParentStatusCard({ theme, familyId }: { readonly theme: ThemeDefinition; readonly familyId: string }) {
  const [snapshot, setSnapshot] = useState<{ familyId: string; day: string; value: ParentOverview | null } | null>(null);
  const [deviceSnapshot, setDeviceSnapshot] = useState<{ familyId: string; value: Remote } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [remoteKey, setRemoteKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncStatus = useSyncStatus();
  const currentSync = syncStatus.familyId === familyId ? syncStatus : null;
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const day = toLocalDateStr(useNow());
  const overview = snapshot?.familyId === familyId && snapshot.day === day ? snapshot.value : undefined;
  const remote: Remote = deviceSnapshot?.familyId === familyId ? deviceSnapshot.value : { state: 'loading' };
  const refreshFromServer = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await runSync({ familyId, role: 'parent' });
      refresh();
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    let active = true;
    void loadParentOverview(familyId).then((value) => { if (active) setSnapshot({ familyId, day, value }); }).catch(() => { if (active) setSnapshot({ familyId, day, value: null }); });
    return () => { active = false; };
  }, [familyId, refreshKey, day]);
  useEffect(() => {
    let active = true;
    void fetchChildDeviceStatus(familyId)
      .then((device) => { if (active) setDeviceSnapshot({ familyId, value: { state: 'ready', device } }); })
      .catch((error: unknown) => { if (active) setDeviceSnapshot({ familyId, value: { state: 'error', message: error instanceof Error ? error.message : '딸 폰 기록을 불러오지 못했어요.' } }); });
    return () => { active = false; };
  }, [familyId, refreshKey, remoteKey]);
  // 딸 폰의 동기화 기록은 Realtime으로 오지 않아(기기 기록은 게시하지 않음) 화면이 앞에 있는 동안 30초마다 다시 본다(편집 뒤 반영 확인)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => setRemoteKey((value) => value + 1), REMOTE_REFRESH_MS); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') start(); else stop(); });
    return () => { stop(); subscription.remove(); };
  }, []);
  // 동기화가 끝나면(서버 내용 반영) 그리고 앱으로 돌아오면 다시 읽는다
  useEffect(() => subscribeWidgetChecksApplied(refresh), [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const { colors } = theme;
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>딸 오늘 현황</Text>
    {overview === undefined ? <Text style={[styles.body, { color: colors.textMuted }]}>불러오는 중이에요.</Text>
      : overview === null ? <Text style={[styles.body, { color: colors.textMuted }]}>이 가족의 오늘 현황을 아직 확인하지 못했어요. 서버와 맞춘 뒤 다시 확인해 주세요.</Text>
      : <View style={styles.section}>
        <Text style={[styles.body, { color: colors.text }]}>{taskProgressLine(overview.tasks)}</Text>
        {overview.tasks.map((task) => <Text key={task.id} style={[styles.item, { color: task.completed === 1 ? colors.text : colors.textMuted }]}>
          {task.completed === 1 ? '✅ ' : '⬜ '}{task.title}
        </Text>)}
        <Text style={[styles.body, { color: colors.text }]}>💎 {stickerLine(overview.stickers)}</Text>
      </View>}
    <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.textMuted }]}>{childSyncLine(remote, lastAdminEditAt(familyId))}</Text>
    <Text style={[styles.body, { color: colors.textMuted }]}>이 폰 마지막 동기화: {formatSyncTime(hasSyncedFamily(familyId) ? lastSyncedAt() : null)}</Text>
    {currentSync?.state === 'error' && <Text style={[styles.body, { color: colors.textMuted }]}>{currentSync.message}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="딸 현황 새로 보기" disabled={syncing} onPress={() => void refreshFromServer()} style={({ pressed }) => [styles.button, { borderColor: colors.primary, opacity: pressed || syncing ? 0.7 : 1 }]}>
      <Text style={[styles.buttonText, { color: colors.primary }]}>새로 보기</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md },
  section: { gap: adminSpacing.xs },
  heading: { fontSize: adminFontSize.title, fontWeight: '800' },
  body: { fontSize: adminFontSize.body, lineHeight: 22 },
  item: { fontSize: adminFontSize.label, lineHeight: 20, paddingLeft: adminSpacing.xs },
  button: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
