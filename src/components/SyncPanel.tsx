import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { useAccount } from '../store/accountStore';
import { lastSyncedAt, resyncFromServer, runSync, syncTarget } from '../sync/syncRunner';
import { formatSyncTime, useSyncStatus, type SyncStatus } from '../sync/syncStatus';

/**
 * 관리자 '기타 → 서버 연결' 아래: 마지막으로 서버와 맞춘 시각, '지금 서버와 맞추기', '서버 내용으로 이 폰 다시 맞추기'.
 * 가족에 연결된 계정일 때만 보인다.
 */
export function SyncPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const status = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const target = syncTarget(account);
  if (!target) return null;
  const busy = status.state === 'syncing';
  const primary = [styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }];
  const outline = [styles.button, { borderColor: theme.colors.border, borderWidth: 1, opacity: busy ? 0.6 : 1 }];
  return <View style={[styles.container, { borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.colors.text }]}>{syncSummary(status, lastSyncedAt())}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runSync(target)} style={primary}>
      <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{busy ? '맞추는 중' : '지금 서버와 맞추기'}</Text>
    </Pressable>
    {confirming ? <>
      <Text style={[styles.body, { color: theme.colors.text }]}>이 폰의 시간표·할 일·체크·보석 기록을 서버 내용으로 바꿔요. 아직 서버에 올라가지 않은 이 폰의 기록은 사라져요.</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirming(false); void resyncFromServer(target); }} style={[...primary, styles.flex]}>
          <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>네, 다시 맞출게요</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirming(false)} style={[...outline, styles.flex]}>
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>취소</Text>
        </Pressable>
      </View>
    </> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirming(true)} style={outline}>
      <Text style={[styles.buttonText, { color: theme.colors.text }]}>서버 내용으로 이 폰 다시 맞추기</Text>
    </Pressable>}
  </View>;
}

/** 동기화 상태 한 줄. 테스트에서 확인할 수 있게 내보낸다. */
export function syncSummary(status: SyncStatus, storedLast: string | null, now = new Date()): string {
  if (status.state === 'syncing') return '서버와 맞추는 중이에요.';
  const last = `마지막으로 맞춘 때: ${formatSyncTime(status.lastSyncedAt ?? storedLast, now)}`;
  return status.state === 'error' ? `${status.message} (${last})` : last;
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, gap: adminSpacing.xs, marginTop: adminSpacing.sm, paddingTop: adminSpacing.sm, width: '100%' },
  body: { fontSize: adminFontSize.label, lineHeight: 20 },
  row: { flexDirection: 'row', gap: adminSpacing.xs },
  flex: { flex: 1 },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
