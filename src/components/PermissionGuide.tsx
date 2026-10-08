import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAndroidPermissionStatus, openAndroidPermissionSettings, requestAndroidNotificationPermission, type AndroidPermissionStatus } from '../notifications/secureAlarmPoc';
import { areRequiredAndroidPermissionsReady, shouldOpenNotificationSettings } from '../notifications/permissionStatus';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';

const items = [{ key: 'notifications', label: '알림' }, { key: 'exactAlarms', label: '정확한 알람' }, { key: 'fullScreen', label: '전체 화면 알림' }, { key: 'battery', label: '배터리 최적화 예외' }] as const;
type PermissionGuideProps = {
 readonly theme: ThemeDefinition;
 readonly hideWhenReady?: boolean;
 /** 관리자 화면용: 네 권한이 모두 허용돼 있으면 한 줄로 접어 두고, 부족하거나 확인에 실패하면 펼쳐 보여준다. */
 readonly collapseWhenReady?: boolean;
 /** 아이 화면용: 준비 안 됐을 때만 한 줄 배너로만 보여준다. */
 readonly banner?: { readonly onPress: () => void };
};

function usePermissionStatus() {
  const [status, setStatus] = useState<AndroidPermissionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRefresh = useRef(0);
  const isMounted = useRef(true);
  const refresh = () => {
    const refreshId = ++latestRefresh.current;
    // 이미 알고 있는 상태가 있으면 화면에서 지우지 않고, 조용히 최신값으로만 교체한다.
    // 그렇지 않으면 앱을 열 때마다(AppState active) "확인 중…"이 잠깐 깜빡인다.
    void getAndroidPermissionStatus().then((next) => {
      if (!isMounted.current || refreshId !== latestRefresh.current) return;
      setStatus(next); setError(null);
    }).catch(() => {
      if (!isMounted.current || refreshId !== latestRefresh.current) return;
      setError('권한 상태를 다시 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    });
  };
  useEffect(() => { isMounted.current = true; void Promise.resolve().then(refresh); const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); }); return () => { isMounted.current = false; sub.remove(); }; }, []);
  const allReady = status !== null && areRequiredAndroidPermissionsReady(status);
  return { status, error, allReady, refresh };
}

export function PermissionGuide({ theme, hideWhenReady = false, collapseWhenReady = false, banner }: PermissionGuideProps) {
  const { status, error, allReady, refresh } = usePermissionStatus();
  const [opening, setOpening] = useState<(typeof items)[number]['key'] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const openSettings = async (key: (typeof items)[number]['key']) => {
    setOpening(key); setActionError(null);
    try {
      if (key === 'notifications' && status?.notifications === false) {
        const granted = await requestAndroidNotificationPermission();
        const nextStatus = await getAndroidPermissionStatus();
        if (shouldOpenNotificationSettings(granted, nextStatus.notifications)) await openAndroidPermissionSettings(key);
      } else await openAndroidPermissionSettings(key);
      refresh();
    } catch { setActionError('설정을 열지 못했어요. 휴대폰 설정에서 채아시간표 권한을 확인해 주세요.'); }
    finally { setOpening(null); }
  };

  if (banner) {
    if (allReady || status === null) return null;
    return <Pressable accessibilityRole="button" accessibilityLabel="알림 준비 안내" onPress={banner.onPress} style={[styles.bannerCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.warning }]}>
      <Text style={[styles.bannerText, { color: theme.colors.text }]}>🔔 아빠에게 폰을 보여 주세요</Text>
    </Pressable>;
  }

  if (hideWhenReady && allReady) return null;
  // 조회에 실패했다면(이전에 읽은 값이 남아 있어도) 허용 완료로 취급하지 않고 펼쳐서 오류와 재확인 경로를 보여준다
  const collapsible = collapseWhenReady && allReady && error === null;
  if (collapsible && !expanded) {
    return <Pressable accessibilityRole="button" accessibilityLabel="알림 준비 열기" accessibilityState={{ expanded: false }} onPress={() => setExpanded(true)} style={[styles.collapsed, { borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>🔔 알림 준비: 모두 허용됨</Text><Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>열기 ▼</Text>
    </Pressable>;
  }
  const unknown = status === null;
  return <View style={[styles.card, { borderColor: theme.colors.border }]}><Text style={[styles.title, { color: theme.colors.text }]}>알림 준비</Text>{collapsible && <Pressable accessibilityRole="button" accessibilityLabel="알림 준비 접기" accessibilityState={{ expanded: true }} onPress={() => setExpanded(false)} style={styles.button}><Text style={{ color: theme.colors.textMuted }}>접기 ▲</Text></Pressable>}{items.map(({ key, label }) => <View key={key} style={styles.row}><Text style={{ color: theme.colors.text }}>{label}: {unknown ? '확인 중…' : status[key] ? '허용됨' : '확인이 필요해요'}</Text>{!unknown && status[key] !== true && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 설정 열기`} disabled={opening !== null} onPress={() => void openSettings(key)} style={[styles.button, { backgroundColor: theme.colors.primary }, opening !== null && styles.buttonDisabled]}><Text style={{ color: theme.colors.onPrimary }}>{opening === key ? '여는 중…' : '허용하기'}</Text></Pressable>}</View>)}{(error ?? actionError) && <Text style={[styles.error, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ {error ?? actionError}</Text>}{error !== null && <Pressable accessibilityRole="button" accessibilityLabel="권한 다시 확인" onPress={refresh} style={[styles.button, { backgroundColor: theme.colors.primary }]}><Text style={{ color: theme.colors.onPrimary }}>다시 확인</Text></Pressable>}</View>;
}
const styles = StyleSheet.create({
  // 관리자 화면의 카드 경로 전용 크기(아이 화면 배너 경로는 아래 banner* 스타일을 그대로 쓴다)
  card: { borderRadius: borderRadius.lg, borderWidth: 1, gap: adminSpacing.xs, padding: adminSpacing.sm, width: '100%' },
  title: { fontSize: adminFontSize.body, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  button: { alignItems: 'center', borderRadius: borderRadius.md, minHeight: adminTouchTarget, justifyContent: 'center', paddingHorizontal: adminSpacing.sm },
  buttonDisabled: { opacity: 0.6 },
  error: { fontSize: adminFontSize.label },
  collapsed: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm, width: '100%' },
  bannerCard: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, padding: spacing.md, width: '100%' },
  bannerText: { fontSize: fontSize.sm, fontWeight: '700' },
});
