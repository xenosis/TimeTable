import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { borderRadius, fontSize, spacing, touchTarget } from '../src/theme';
import { adminSpacing } from '../src/theme/admin';
import { PeriodSettings } from '../src/components/PeriodSettings';
import { TimetableSetPanel } from '../src/components/TimetableSetPanel';
import { TimetableEditor } from '../src/components/TimetableEditor';
import { WeekdayCopy } from '../src/components/WeekdayCopy';
import { PinGate } from '../src/components/PinGate';
import { scheduleNotificationPoc } from '../src/notifications/notificationPoc';
import { initializeNotificationChannels, isFullScreenAlarmAllowed, openFullScreenAlarmSettings, scheduleSecureAlarmPoc } from '../src/notifications/secureAlarmPoc';
import { useActiveTheme } from '../src/theme/provider';
import { RewardGoalEditor } from '../src/components/RewardGoalEditor';
import { PermissionGuide } from '../src/components/PermissionGuide';
import { TaskEditor } from '../src/components/TaskEditor';
import { getDatabase } from '../src/db/database';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableSet } from '../src/db/types';
import { requestRollingScheduleRefresh } from '../src/notifications/rollingRefresh';
import { requestTaskRollingScheduleRefresh } from '../src/notifications/taskRollingSchedule';

export default function ManageScreen() {
  const { theme } = useActiveTheme();
  const [status, setStatus] = useState('아직 알림을 예약하지 않았어요.');
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSchedulingAlarm, setIsSchedulingAlarm] = useState(false);
  const [isOpeningAlarmSettings, setIsOpeningAlarmSettings] = useState(false);
  const [fullScreenAlarmAllowed, setFullScreenAlarmAllowed] = useState<boolean | null>(null);
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [timetableSet, setTimetableSet] = useState<TimetableSet | null>(null);

  const { colors, categories: categoryPalette } = theme;

  useEffect(() => {
    void getDatabase().then((database) => getActiveTimetableSet(database)).then(setTimetableSet).catch(() => setStatus('시간표를 불러오지 못했어요.'));
  }, []);

  const refreshFullScreenAlarmPermission = () => {
    void isFullScreenAlarmAllowed().then(setFullScreenAlarmAllowed).catch(() => setFullScreenAlarmAllowed(false));
  };

  useEffect(() => {
    void initializeNotificationChannels().catch(() => setStatus('알림 채널을 준비하지 못했어요.'));
    refreshFullScreenAlarmPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setFullScreenAlarmAllowed(null);
      refreshFullScreenAlarmPermission();
    });
    return () => subscription.remove();
  }, []);

  const applyTimetableSet = (set: TimetableSet) => {
    setTimetableSet(set);
    setScheduleRefresh((value) => value + 1);
  };

  const refreshAfterScheduleChange = async () => {
    setScheduleRefresh((value) => value + 1);
    try { await requestRollingScheduleRefresh(); }
    catch (error) { setStatus('시간표 알림을 다시 예약하지 못했어요.'); throw error; }
  };

  const refreshAfterTaskChange = async () => {
    try { await requestTaskRollingScheduleRefresh(); }
    catch (error) { setStatus('할 일 알림을 다시 예약하지 못했어요.'); throw error; }
  };

  const schedulePoc = async () => {
    setIsScheduling(true);
    try {
      const result = await scheduleNotificationPoc();
      if (result.kind === 'permission-denied') {
        setStatus('알림 권한이 필요해요. 설정에서 TimeTable 알림을 허용한 뒤 다시 눌러 주세요.');
        return;
      }
      setStatus(`1분 뒤 알림을 예약했어요. 확인 번호: ${result.notificationId}`);
    } catch (error) {
      setStatus(`알림 예약에 실패했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleRebootPoc = async () => {
    setIsScheduling(true);
    try {
      const result = await scheduleNotificationPoc(180_000);
      if (result.kind === 'permission-denied') { setStatus('알림 권한이 필요해요. 설정에서 TimeTable 알림을 허용한 뒤 다시 눌러 주세요.'); return; }
      setStatus('3분 뒤 일반 알림을 예약했어요. 1분 안에 재부팅한 뒤 잠금을 풀고, 예약 시각까지 기다려 주세요.');
    } catch (error) { setStatus(`재부팅 확인 예약에 실패했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`); }
    finally { setIsScheduling(false); }
  };

  const scheduleAlarm = async () => {
    setIsSchedulingAlarm(true);
    try {
      const result = await scheduleSecureAlarmPoc();
      setStatus(`${result.seconds}초 뒤 전용 알람 화면을 예약했어요. 잠금은 풀리지 않고, 알람 문구와 끄기만 보여야 해요.`);
    } catch (error) {
      setStatus(`알람 예약에 실패했어요: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsSchedulingAlarm(false);
    }
  };

  const openAlarmSettings = async () => {
    setIsOpeningAlarmSettings(true);
    try { await openFullScreenAlarmSettings(); }
    catch { setStatus('전체 화면 알림 설정을 열지 못했어요. Android 설정에서 TimeTable을 찾아 허용해 주세요.'); }
    finally { setIsOpeningAlarmSettings(false); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <PermissionGuide theme={theme} />
      <PinGate theme={theme}>
        <TaskEditor theme={theme} onChanged={refreshAfterTaskChange} />
        <RewardGoalEditor theme={theme} onChanged={() => undefined} />
        {timetableSet && <TimetableSetPanel theme={theme} activeSet={timetableSet} refreshKey={scheduleRefresh} onApplied={applyTimetableSet} onRenamed={setTimetableSet} />}
        <PeriodSettings onSaved={refreshAfterScheduleChange} />
        {timetableSet && <TimetableEditor key={timetableSet.id} refreshKey={scheduleRefresh} theme={theme} setId={timetableSet.id} onChanged={refreshAfterScheduleChange} />}
        {timetableSet && <WeekdayCopy theme={theme} setId={timetableSet.id} onCopied={refreshAfterScheduleChange} />}
      </PinGate>
      <Text style={[styles.title, { color: colors.text }]}>일반 알림 확인 🎈</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>아래 버튼을 누른 뒤 1분 후 알림이 오는지 확인해 주세요.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="1분 뒤 알림 예약"
        disabled={isScheduling}
        onPress={schedulePoc}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (pressed || isScheduling) && styles.buttonPressed]}
      >
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{isScheduling ? '예약 중…' : '1분 뒤 알림 예약'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="3분 뒤 재부팅 복구 확인 예약" disabled={isScheduling} onPress={scheduleRebootPoc} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (pressed || isScheduling) && styles.buttonPressed]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{isScheduling ? '예약 중…' : '3분 뒤 재부팅 복구 확인'}</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>잠금 화면 알람 확인 ⏰</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>15초 뒤 전용 알람 화면과 반복음을 확인해 주세요. 잠금 해제나 일반 앱 화면은 열리지 않아야 해요.</Text>
      {fullScreenAlarmAllowed === null && <Text style={[styles.subtitle, { color: colors.textMuted }]}>전체 화면 알림 권한을 확인하고 있어요.</Text>}
      {fullScreenAlarmAllowed === false && <>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>전체 화면 알림이 꺼져 있어요. 먼저 허용해 주세요.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="전체 화면 알림 설정 열기" disabled={isOpeningAlarmSettings} onPress={() => void openAlarmSettings()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (pressed || isOpeningAlarmSettings) && styles.buttonPressed]}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{isOpeningAlarmSettings ? '설정 여는 중…' : '전체 화면 알림 허용하기'}</Text>
        </Pressable>
      </>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="15초 뒤 잠금 화면 알람 예약"
        disabled={isSchedulingAlarm || fullScreenAlarmAllowed !== true}
        onPress={scheduleAlarm}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (pressed || isSchedulingAlarm || fullScreenAlarmAllowed !== true) && styles.buttonPressed]}
      >
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{fullScreenAlarmAllowed !== true ? '전체 화면 알림을 먼저 허용해 주세요' : isSchedulingAlarm ? '예약 중…' : '15초 뒤 잠금 화면 알람'}</Text>
      </Pressable>
      <View accessibilityLabel="시간표 과목 색상 미리보기" style={styles.categoryPreview}>
        {categoryPalette.map((category) => (
          <View key={category.key} style={[styles.categoryChip, { backgroundColor: category.backgroundColor }]}>
            <Text style={[styles.categoryChipText, { color: category.textColor }]}>
              {category.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.status, { color: colors.text }]}>{status}</Text>
      <Text style={[styles.checklist, { color: colors.textMuted }]}>확인: 잠금 유지 · 전용 알람 문구 · 반복음 · ‘끄기’ 동작</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexGrow: 1,
    padding: adminSpacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  button: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  categoryPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  categoryChip: {
    minHeight: touchTarget.minimum,
    minWidth: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  status: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  checklist: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
