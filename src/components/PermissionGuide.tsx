import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAndroidPermissionStatus, openAndroidPermissionSettings, requestAndroidNotificationPermission, type AndroidPermissionStatus } from '../notifications/secureAlarmPoc';
import { areRequiredAndroidPermissionsReady, shouldOpenNotificationSettings } from '../notifications/permissionStatus';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

const items = [{ key: 'notifications', label: '알림' }, { key: 'exactAlarms', label: '정확한 알람' }, { key: 'fullScreen', label: '전체 화면 알림' }, { key: 'battery', label: '배터리 최적화 예외' }] as const;
type PermissionGuideProps = {
 readonly theme: ThemeDefinition;
 readonly hideWhenReady?: boolean;
};

export function PermissionGuide({ theme, hideWhenReady = false }: PermissionGuideProps) {
 const [status, setStatus] = useState<AndroidPermissionStatus | null>(null);
 const [opening, setOpening] = useState<(typeof items)[number]['key'] | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [isRefreshing, setIsRefreshing] = useState(true);
 const latestRefresh = useRef(0);
 const isMounted = useRef(true);
 const refresh = () => {
  const refreshId = ++latestRefresh.current;
  setIsRefreshing(true);
  void getAndroidPermissionStatus().then((next) => {
   if (!isMounted.current || refreshId !== latestRefresh.current) return;
   setStatus(next); setError(null);
  }).catch(() => {
   if (!isMounted.current || refreshId !== latestRefresh.current) return;
   setStatus(null); setError('권한 상태를 다시 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }).finally(() => {
   if (isMounted.current && refreshId === latestRefresh.current) setIsRefreshing(false);
  });
 };
 const openSettings = async (key: (typeof items)[number]['key']) => {
  setOpening(key); setError(null);
  try {
   if (key === 'notifications' && status?.notifications === false) {
    const granted = await requestAndroidNotificationPermission();
    const nextStatus = await getAndroidPermissionStatus();
    if (shouldOpenNotificationSettings(granted, nextStatus.notifications)) await openAndroidPermissionSettings(key);
   } else await openAndroidPermissionSettings(key);
   refresh();
  } catch { setError('설정을 열지 못했어요. 휴대폰 설정에서 TimeTable 권한을 확인해 주세요.'); }
  finally { setOpening(null); }
  };
 useEffect(() => { isMounted.current = true; void Promise.resolve().then(refresh); const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); }); return () => { isMounted.current = false; sub.remove(); }; }, []);
 const unknown = status === null;
  const allReady = !isRefreshing && status !== null && areRequiredAndroidPermissionsReady(status);
  if (hideWhenReady && allReady) return null;
  return <View style={[styles.card, { borderColor: theme.colors.border }]}><Text style={[styles.title, { color: theme.colors.text }]}>알림 준비</Text>{items.map(({ key, label }) => <View key={key} style={styles.row}><Text style={{ color: theme.colors.text }}>{label}: {isRefreshing ? '확인 중…' : status?.[key] ? '허용됨' : unknown ? '확인하지 못했어요' : '확인이 필요해요'}</Text>{!isRefreshing && !unknown && status?.[key] !== true && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 설정 열기`} disabled={opening !== null} onPress={() => void openSettings(key)} style={[styles.button, { backgroundColor: theme.colors.primary }, opening !== null && styles.buttonDisabled]}><Text style={{ color: theme.colors.onPrimary }}>{opening === key ? '여는 중…' : '허용하기'}</Text></Pressable>}</View>)}{unknown && !isRefreshing && <Pressable accessibilityRole="button" accessibilityLabel="권한 상태 다시 확인" onPress={refresh} style={[styles.button, { backgroundColor: theme.colors.primary }]}><Text style={{ color: theme.colors.onPrimary }}>다시 확인</Text></Pressable>}{error && <Text style={[styles.error, { color: theme.colors.text, fontWeight: '700' }]}>⚠️ {error}</Text>}</View>;
}
const styles = StyleSheet.create({ card: { borderRadius: borderRadius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, width: '100%' }, title: { fontSize: fontSize.md, fontWeight: '700' }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, button: { borderRadius: borderRadius.md, minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.md }, buttonDisabled: { opacity: 0.6 }, error: { fontSize: fontSize.sm } });
