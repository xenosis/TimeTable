import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { adminFontSize, adminSpacing } from '../src/theme/admin';
import { borderRadius, touchTarget } from '../src/theme';
import { AdminCollapsible } from '../src/components/AdminCollapsible';
import { AdminSectionMenu } from '../src/components/AdminSectionMenu';
import { DeviceTestPanel } from '../src/components/DeviceTestPanel';
import { GemRequestsPanel } from '../src/components/GemRequestsPanel';
import { PeriodSettings } from '../src/components/PeriodSettings';
import { TimetableSetPanel } from '../src/components/TimetableSetPanel';
import { TimetableEditor } from '../src/components/TimetableEditor';
import { WeekdayCopy } from '../src/components/WeekdayCopy';
import { PinGate } from '../src/components/PinGate';
import { initializeNotificationChannels } from '../src/notifications/secureAlarmPoc';
import { useActiveTheme } from '../src/theme/provider';
import { RewardGoalEditor } from '../src/components/RewardGoalEditor';
import { PermissionGuide } from '../src/components/PermissionGuide';
import { TaskEditor } from '../src/components/TaskEditor';
import { getDatabase } from '../src/db/database';
import { getActiveTimetableSet } from '../src/db/timetableSetRepository';
import type { TimetableSet } from '../src/db/types';
import { requestRollingScheduleRefresh } from '../src/notifications/rollingRefresh';
import { requestTaskRollingScheduleRefresh } from '../src/notifications/taskRollingSchedule';
import { CLEAN_FORM_STATE, DEFAULT_ADMIN_SECTION, decideSectionSwitch, type AdminFormState, type AdminSectionKey } from '../src/utils/adminSections';

export default function ManageScreen() {
  const { theme } = useActiveTheme();
  const { colors, categories: categoryPalette } = theme;
  const [section, setSection] = useState<AdminSectionKey>(DEFAULT_ADMIN_SECTION);
  const [status, setStatus] = useState('');
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [timetableSet, setTimetableSet] = useState<TimetableSet | null>(null);
  // 현재 열린 편집 폼의 미저장·저장 중 상태. 한 번에 한 영역만 열려 있으므로 하나만 둔다
  const formState = useRef<AdminFormState>(CLEAN_FORM_STATE);
  const reportFormState = useCallback((state: AdminFormState) => { formState.current = state; }, []);

  useEffect(() => {
    void getDatabase().then((database) => getActiveTimetableSet(database)).then(setTimetableSet).catch(() => setStatus('시간표를 불러오지 못했어요.'));
    void initializeNotificationChannels().catch(() => setStatus('알림 채널을 준비하지 못했어요.'));
  }, []);

  const moveTo = (next: AdminSectionKey) => { formState.current = CLEAN_FORM_STATE; setStatus(''); setSection(next); };
  const selectSection = (next: AdminSectionKey) => {
    const decision = decideSectionSwitch(section, next, formState.current);
    if (decision === 'switch') moveTo(next);
    else if (decision === 'blocked') setStatus('저장하는 중이에요. 끝난 뒤에 옮길 수 있어요.');
    else if (decision === 'confirm') {
      Alert.alert('작성 중인 내용이 있어요', '다른 영역으로 옮기면 저장하지 않은 내용이 사라져요.', [
        { text: '계속 편집', style: 'cancel' },
        { text: '버리고 이동', style: 'destructive', onPress: () => moveTo(next) },
      ]);
    }
  };

  // 시간표를 바꾸면 편집기가 새로 열리므로, 저장하지 않은 입력이 있으면 버려도 되는지 먼저 묻는다
  const confirmDiscard = () => new Promise<boolean>((resolve) => {
    const form = formState.current;
    if (form.saving) { setStatus('저장하는 중이에요. 끝난 뒤에 바꿀 수 있어요.'); resolve(false); return; }
    if (!form.dirty) { resolve(true); return; }
    Alert.alert('작성 중인 내용이 있어요', '시간표를 바꾸면 저장하지 않은 내용이 사라져요.', [
      { text: '계속 편집', style: 'cancel', onPress: () => resolve(false) },
      { text: '버리고 바꾸기', style: 'destructive', onPress: () => { formState.current = CLEAN_FORM_STATE; resolve(true); } },
    ], { onDismiss: () => resolve(false) });
  });

  const applyTimetableSet = (set: TimetableSet) => { setTimetableSet(set); setScheduleRefresh((value) => value + 1); };
  const refreshAfterScheduleChange = async () => {
    setScheduleRefresh((value) => value + 1);
    try { await requestRollingScheduleRefresh(); }
    catch (error) { setStatus('시간표 알림을 다시 예약하지 못했어요.'); throw error; }
  };
  const refreshAfterTaskChange = async () => {
    try { await requestTaskRollingScheduleRefresh(); }
    catch (error) { setStatus('할 일 알림을 다시 예약하지 못했어요.'); throw error; }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <PermissionGuide theme={theme} collapseWhenReady />
      <PinGate theme={theme}>
        <AdminSectionMenu selected={section} onSelect={selectSection} theme={theme} />
        {status !== '' && <Text accessibilityLiveRegion="polite" style={[styles.status, { color: colors.text }]}>{status}</Text>}
        {section === 'timetable' && <>
          {timetableSet && <TimetableSetPanel theme={theme} activeSet={timetableSet} refreshKey={scheduleRefresh} onApplied={applyTimetableSet} onRenamed={setTimetableSet} confirmDiscard={confirmDiscard} />}
          {timetableSet && <TimetableEditor key={timetableSet.id} refreshKey={scheduleRefresh} theme={theme} setId={timetableSet.id} onChanged={refreshAfterScheduleChange} onFormState={reportFormState} />}
          <AdminCollapsible title="교시 시간" theme={theme}><PeriodSettings onSaved={refreshAfterScheduleChange} /></AdminCollapsible>
          {timetableSet && <AdminCollapsible title="요일 시간표 복사" theme={theme}><WeekdayCopy theme={theme} setId={timetableSet.id} onCopied={refreshAfterScheduleChange} /></AdminCollapsible>}
        </>}
        {section === 'tasks' && <TaskEditor theme={theme} onChanged={refreshAfterTaskChange} onFormState={reportFormState} />}
        {section === 'rewards' && <>
          {/* 딸이 요청한 실물 보석을 확인하고 '줬어요'로 처리한다(앱의 보석 개수는 바꾸지 않는다). 정책은 docs/backlog/P4.13.md */}
          <GemRequestsPanel theme={theme} />
          <RewardGoalEditor theme={theme} onChanged={() => undefined} />
        </>}
        {section === 'etc' && <>
          <AdminCollapsible title="기기 테스트 (알림·알람)" theme={theme}><DeviceTestPanel theme={theme} /></AdminCollapsible>
          <AdminCollapsible title="진단: 과목 색상 미리보기" theme={theme}>
            <View accessibilityLabel="시간표 과목 색상 미리보기" style={styles.categoryPreview}>
              {categoryPalette.map((category) => (
                <View key={category.key} style={[styles.categoryChip, { backgroundColor: category.backgroundColor }]}>
                  <Text style={[styles.categoryChipText, { color: category.textColor }]}>{category.label}</Text>
                </View>
              ))}
            </View>
          </AdminCollapsible>
        </>}
      </PinGate>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, padding: adminSpacing.md, gap: adminSpacing.sm },
  status: { fontSize: adminFontSize.label, textAlign: 'center' },
  categoryPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: adminSpacing.xs },
  categoryChip: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum, paddingHorizontal: adminSpacing.xs },
  categoryChipText: { fontSize: adminFontSize.label, fontWeight: '700' },
});
