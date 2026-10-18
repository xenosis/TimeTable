import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';

import { adminFontSize, adminSpacing } from '../../src/theme/admin';
import { borderRadius, touchTarget } from '../../src/theme';
import { AdminCollapsible } from '../../src/components/AdminCollapsible';
import { AdminSectionMenu } from '../../src/components/AdminSectionMenu';
import { AccountPanel } from '../../src/components/AccountPanel';
import { LocalImportPanel } from '../../src/components/LocalImportPanel';
import { SyncPanel } from '../../src/components/SyncPanel';
import { DeviceTestPanel } from '../../src/components/DeviceTestPanel';
import { GemRequestsPanel } from '../../src/components/GemRequestsPanel';
import { PeriodSettings } from '../../src/components/PeriodSettings';
import { TimetableSetPanel } from '../../src/components/TimetableSetPanel';
import { TimetableEditor } from '../../src/components/TimetableEditor';
import { WeekdayCopy } from '../../src/components/WeekdayCopy';
import { SchoolTimetableImport } from '../../src/components/SchoolTimetableImport';
import { PinGate } from '../../src/components/PinGate';
import { initializeNotificationChannels } from '../../src/notifications/secureAlarmPoc';
import { isParentDevice, useAccount } from '../../src/store/accountStore';
import { useActiveTheme } from '../../src/theme/provider';
import { RewardGoalEditor } from '../../src/components/RewardGoalEditor';
import { PermissionGuide } from '../../src/components/PermissionGuide';
import { TaskEditor } from '../../src/components/TaskEditor';
import { getDatabase } from '../../src/db/database';
import { getActiveTimetableSet } from '../../src/db/timetableSetRepository';
import type { TimetableSet } from '../../src/db/types';
import { requestRollingScheduleRefresh } from '../../src/notifications/rollingRefresh';
import { requestTaskRollingScheduleRefresh } from '../../src/notifications/taskRollingSchedule';
import { CLEAN_FORM_STATE, DEFAULT_ADMIN_SECTION, decideSectionSwitch, type AdminFormState, type AdminSectionKey } from '../../src/utils/adminSections';

export default function ManageScreen() {
  // 아빠 폰(아빠 계정 로그인)은 딸이 쓰지 않으므로 PIN 없이 바로 연다. 딸 폰·로컬 모드는 계속 PIN 뒤에 둔다
  const parentDevice = isParentDevice(useAccount());
  const { theme } = useActiveTheme();
  const { colors, categories: categoryPalette } = theme;
  const [section, setSection] = useState<AdminSectionKey>(DEFAULT_ADMIN_SECTION);
  const [status, setStatus] = useState('');
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [timetableSet, setTimetableSet] = useState<TimetableSet | null>(null);
  // 현재 열린 편집 폼의 미저장·저장 중 상태. 한 번에 한 영역만 열려 있으므로 하나만 둔다
  const formState = useRef<AdminFormState>(CLEAN_FORM_STATE);
  const setBusy = useRef(false);
  const reportSetBusy = useCallback((busy: boolean) => { setBusy.current = busy; }, []);
  const reportFormState = useCallback((state: AdminFormState) => { formState.current = state; }, []);
  // 시간표 항목 폼이 열려 있는 동안에는 교시·요일 복사를 숨긴다(열린 폼의 항목·교시가 바뀌어 저장이 어긋나지 않게, P9.7 리뷰 M-A)
  const [timetableFormOpen, setTimetableFormOpen] = useState(false);
  const navigation = useNavigation();

  // 헤더 뒤로 가기 화살표·휴대폰 뒤로 가기로 관리자 화면을 떠날 때도 저장하지 않은 입력을 조용히 버리지 않는다(P9.7 리뷰 H-A)
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    const form = formState.current;
    const busy = form.saving || setBusy.current;
    if (!form.dirty && !busy) return;
    event.preventDefault();
    if (busy) { setStatus('저장하는 중이에요. 끝난 뒤에 나갈 수 있어요.'); return; }
    Alert.alert('작성 중인 내용이 있어요', '나가면 저장하지 않은 내용이 사라져요.', [
      { text: '계속 편집', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: () => { formState.current = CLEAN_FORM_STATE; navigation.dispatch(event.data.action); } },
    ]);
  }), [navigation]);

  // 설정은 하단 탭 안에 있어 휴대폰 뒤로 가기에 닫을 화면이 없다. 앱이 바로 나가지 않도록 첫 탭으로 보내고,
  // 그 이동이 위 beforeRemove 확인(저장하지 않은 입력 경고)을 거치게 한다. 열린 시간표 폼은 자체 뒤로 가기 처리가 먼저 받는다
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { router.replace('/'); return true; });
    return () => subscription.remove();
  }, []));

  useEffect(() => {
    void getDatabase().then((database) => getActiveTimetableSet(database)).then(setTimetableSet).catch(() => setStatus('시간표를 불러오지 못했어요.'));
    void initializeNotificationChannels().catch(() => setStatus('알림 채널을 준비하지 못했어요.'));
  }, []);

  const moveTo = (next: AdminSectionKey) => { formState.current = CLEAN_FORM_STATE; setStatus(''); setSection(next); };
  const selectSection = (next: AdminSectionKey) => {
    const decision = decideSectionSwitch(section, next, { ...formState.current, saving: formState.current.saving || setBusy.current });
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
      // 적용이 실패하면 폼이 그대로 남으므로 여기서 미저장 표시를 지우지 않는다. 편집기가 새로 열리면 스스로 깨끗한 상태를 알린다(P9.7 리뷰 M-B)
      { text: '버리고 바꾸기', style: 'destructive', onPress: () => resolve(true) },
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardContainer}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      {/* 하단 탭 안에 있어 머리 막대가 없으므로 화면 제목을 직접 보인다. 안전 영역 여백은 탭 레이아웃이 처리한다 */}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>관리자 설정</Text>
      <PermissionGuide theme={theme} collapseWhenReady />
      <PinGate theme={theme} bypass={parentDevice}>
        <AdminSectionMenu selected={section} onSelect={selectSection} theme={theme} />
        {status !== '' && <Text accessibilityLiveRegion="polite" style={[styles.status, { color: colors.text }]}>{status}</Text>}
        {section === 'timetable' && <>
          {timetableSet && <TimetableSetPanel theme={theme} activeSet={timetableSet} refreshKey={scheduleRefresh} onApplied={applyTimetableSet} onRenamed={setTimetableSet} confirmDiscard={confirmDiscard} onBusyChange={reportSetBusy} />}
          {timetableSet && <TimetableEditor key={timetableSet.id} refreshKey={scheduleRefresh} theme={theme} setId={timetableSet.id} onChanged={refreshAfterScheduleChange} onFormState={reportFormState} onOpenChange={setTimetableFormOpen} />}
          {!timetableFormOpen && <AdminCollapsible title="교시 시간" theme={theme}><PeriodSettings theme={theme} onSaved={refreshAfterScheduleChange} /></AdminCollapsible>}
          {timetableSet && !timetableFormOpen && <AdminCollapsible title="요일 시간표 복사" theme={theme}><WeekdayCopy theme={theme} setId={timetableSet.id} onCopied={refreshAfterScheduleChange} /></AdminCollapsible>}
          {timetableSet && !timetableFormOpen && <AdminCollapsible title="학교 시간표 가져오기 (나이스)" theme={theme}><SchoolTimetableImport key={timetableSet.id} theme={theme} setId={timetableSet.id} onImported={refreshAfterScheduleChange} /></AdminCollapsible>}
        </>}
        {section === 'tasks' && <TaskEditor theme={theme} onChanged={refreshAfterTaskChange} onFormState={reportFormState} />}
        {section === 'rewards' && <>
          {/* 딸이 요청한 실물 보석을 확인하고 '줬어요'로 처리한다(앱의 보석 개수는 바꾸지 않는다). 정책은 docs/backlog/P4.13.md */}
          <GemRequestsPanel theme={theme} />
          <RewardGoalEditor theme={theme} onChanged={() => undefined} />
        </>}
        {section === 'etc' && <>
          <AdminCollapsible title="서버 연결 (로그인)" theme={theme}><AccountPanel theme={theme} /><SyncPanel theme={theme} /><LocalImportPanel theme={theme} /></AdminCollapsible>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: { flex: 1 },
  container: { alignItems: 'center', flexGrow: 1, padding: adminSpacing.md, gap: adminSpacing.sm },
  title: { alignSelf: 'stretch', fontSize: adminFontSize.title + 3, fontWeight: '800' },
  status: { fontSize: adminFontSize.label, textAlign: 'center' },
  categoryPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: adminSpacing.xs },
  categoryChip: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum, paddingHorizontal: adminSpacing.xs },
  categoryChipText: { fontSize: adminFontSize.label, fontWeight: '700' },
});
