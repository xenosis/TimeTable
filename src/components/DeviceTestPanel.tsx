import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { scheduleNotificationPoc } from '../notifications/notificationPoc';
import { isFullScreenAlarmAllowed, openFullScreenAlarmSettings, scheduleSecureAlarmPoc } from '../notifications/secureAlarmPoc';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { borderRadius, type ThemeDefinition } from '../theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : '알 수 없는 오류');

/**
 * 기기 테스트: 일반 알림 1분, 재부팅 복구 3분, 잠금 화면 알람 15초 예약.
 * 기타 영역에서 사용자가 이 패널을 펼칠 때만 만들어지고, 열기만으로는 아무것도 예약하지 않는다(버튼을 눌러야 예약).
 */
export function DeviceTestPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const [status, setStatus] = useState('아직 알림을 예약하지 않았어요.');
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSchedulingAlarm, setIsSchedulingAlarm] = useState(false);
  const [isOpeningAlarmSettings, setIsOpeningAlarmSettings] = useState(false);
  const [fullScreenAlarmAllowed, setFullScreenAlarmAllowed] = useState<boolean | null>(null);
  const { colors } = theme;

  const refreshPermission = () => { void isFullScreenAlarmAllowed().then(setFullScreenAlarmAllowed).catch(() => setFullScreenAlarmAllowed(false)); };
  useEffect(() => {
    refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setFullScreenAlarmAllowed(null);
      refreshPermission();
    });
    return () => subscription.remove();
  }, []);

  const scheduleGeneral = async (delayMs: number | undefined, doneMessage: (id: string) => string, failMessage: string) => {
    setIsScheduling(true);
    try {
      const result = delayMs === undefined ? await scheduleNotificationPoc() : await scheduleNotificationPoc(delayMs);
      if (result.kind === 'permission-denied') { setStatus('알림 권한이 필요해요. 설정에서 TimeTable 알림을 허용한 뒤 다시 눌러 주세요.'); return; }
      setStatus(doneMessage(result.notificationId));
    } catch (error) { setStatus(`${failMessage}: ${errorText(error)}`); }
    finally { setIsScheduling(false); }
  };

  const scheduleAlarm = async () => {
    setIsSchedulingAlarm(true);
    try {
      const result = await scheduleSecureAlarmPoc();
      setStatus(`${result.seconds}초 뒤 전용 알람 화면을 예약했어요. 잠금은 풀리지 않고, 알람 문구와 끄기만 보여야 해요.`);
    } catch (error) { setStatus(`알람 예약에 실패했어요: ${errorText(error)}`); }
    finally { setIsSchedulingAlarm(false); }
  };

  const openAlarmSettings = async () => {
    setIsOpeningAlarmSettings(true);
    try { await openFullScreenAlarmSettings(); }
    catch { setStatus('전체 화면 알림 설정을 열지 못했어요. Android 설정에서 TimeTable을 찾아 허용해 주세요.'); }
    finally { setIsOpeningAlarmSettings(false); }
  };

  const button = (label: string, a11y: string, onPress: () => void, disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (pressed || disabled) && styles.pressed]}>
      <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );

  return <View style={styles.panel}>
    <Text style={[styles.hint, { color: colors.textMuted }]}>아래 버튼을 누른 뒤 1분 후 알림이 오는지 확인해 주세요.</Text>
    {button(isScheduling ? '예약 중…' : '1분 뒤 알림 예약', '1분 뒤 알림 예약', () => void scheduleGeneral(undefined, (id) => `1분 뒤 알림을 예약했어요. 확인 번호: ${id}`, '알림 예약에 실패했어요'), isScheduling)}
    {button(isScheduling ? '예약 중…' : '3분 뒤 재부팅 복구 확인', '3분 뒤 재부팅 복구 확인 예약', () => void scheduleGeneral(180_000, () => '3분 뒤 일반 알림을 예약했어요. 1분 안에 재부팅한 뒤 잠금을 풀고, 예약 시각까지 기다려 주세요.', '재부팅 확인 예약에 실패했어요'), isScheduling)}
    <Text style={[styles.hint, { color: colors.textMuted }]}>15초 뒤 전용 알람 화면과 반복음을 확인해 주세요. 잠금 해제나 일반 앱 화면은 열리지 않아야 해요.</Text>
    {fullScreenAlarmAllowed === null && <Text style={[styles.hint, { color: colors.textMuted }]}>전체 화면 알림 권한을 확인하고 있어요.</Text>}
    {fullScreenAlarmAllowed === false && <>
      <Text style={[styles.hint, { color: colors.textMuted }]}>전체 화면 알림이 꺼져 있어요. 먼저 허용해 주세요.</Text>
      {button(isOpeningAlarmSettings ? '설정 여는 중…' : '전체 화면 알림 허용하기', '전체 화면 알림 설정 열기', () => void openAlarmSettings(), isOpeningAlarmSettings)}
    </>}
    {button(fullScreenAlarmAllowed !== true ? '전체 화면 알림을 먼저 허용해 주세요' : isSchedulingAlarm ? '예약 중…' : '15초 뒤 잠금 화면 알람 예약', '15초 뒤 잠금 화면 알람 예약', () => void scheduleAlarm(), isSchedulingAlarm || fullScreenAlarmAllowed !== true)}
    <Text style={[styles.hint, { color: colors.text }]}>{status}</Text>
    <Text style={[styles.hint, { color: colors.textMuted }]}>확인: 잠금 유지 · 전용 알람 문구 · 반복음 · ‘끄기’ 동작</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: adminSpacing.sm, width: '100%' },
  hint: { fontSize: adminFontSize.label },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  pressed: { opacity: 0.6 },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
