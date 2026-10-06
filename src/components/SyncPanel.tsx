import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { useAccount } from '../store/accountStore';
import { lastSyncedAt, runSync, syncTarget } from '../sync/syncRunner';
import { formatSyncTime, useSyncStatus, type SyncStatus } from '../sync/syncStatus';

/** 관리자 '기타 → 서버 연결' 아래: 마지막으로 서버와 맞춘 시각과 '지금 맞추기'. 가족에 연결된 계정일 때만 보인다. */
export function SyncPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const status = useSyncStatus();
  const target = syncTarget(account);
  if (!target) return null;
  const busy = status.state === 'syncing';
  return <View style={[styles.container, { borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.colors.text }]}>{syncSummary(status, lastSyncedAt())}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runSync(target)} style={[styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }]}>
      <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{busy ? '맞추는 중' : '지금 서버와 맞추기'}</Text>
    </Pressable>
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
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
