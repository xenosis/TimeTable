import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods } from '../db/periodRepository';
import type { TimetableSetId } from '../db/types';
import { fetchClassTimetable, searchElementarySchools, type SchoolInfo } from '../neis/neisClient';
import { buildWeekPlan, missingPeriods, replaceSchoolItems, schoolWeekDates, type WeekdayPlan } from '../neis/neisImport';
import { loadSchoolProfile, saveSchoolProfile, type SchoolProfile } from '../neis/schoolProfile';
import { loadAutoRefreshState, refreshSchoolTimetableIfDue, type AutoRefreshState } from '../neis/schoolAutoRefresh';
import { formatSyncTime } from '../sync/syncStatus';
import { runAdminEdit } from '../sync/adminEditGate';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { userErrorMessage } from '../utils/userErrorMessage';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const;
const dayLine = (day: WeekdayPlan) => `${WEEKDAY[day.weekday]} ${Number(day.date.slice(4, 6))}/${Number(day.date.slice(6, 8))}: ${day.entries.length === 0 ? '비어 있음(공휴일 등 — 가져오지 않아요)' : day.entries.map((entry) => `${entry.period}교시 ${entry.subject}`).join(' · ')}`;

/**
 * 관리자 → 시간표의 '학교 시간표 가져오기(나이스)'(P8.1). 학교·학년·반을 정해 두고 이번 주/다음 주 시간표를 불러와 미리 본 뒤,
 * 확인을 받고서 과목이 있는 요일의 '학교' 일정만 바꾼다(학원·돌봄 일정은 그대로). 나이스는 교시 번호만 주므로 교시 시간이 먼저 있어야 한다.
 */
export function SchoolTimetableImport({ theme, setId, onImported }: { readonly theme: ThemeDefinition; readonly setId: TimetableSetId; readonly onImported: () => Promise<void> }) {
  const { colors } = theme;
  const [profile, setProfile] = useState<SchoolProfile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<readonly SchoolInfo[]>([]);
  const [picked, setPicked] = useState<SchoolInfo | null>(null);
  const [grade, setGrade] = useState('');
  const [classNo, setClassNo] = useState('');
  const [plan, setPlan] = useState<readonly WeekdayPlan[] | null>(null);
  const [missing, setMissing] = useState<readonly number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [auto, setAuto] = useState<AutoRefreshState | null>(null);

  useEffect(() => {
    let active = true;
    void loadSchoolProfile().then((saved) => { if (active) { setProfile(saved); setEditing(saved === null); } }).catch(() => { if (active) { setProfile(null); setEditing(true); } });
    void loadAutoRefreshState().then((state) => { if (active) setAuto(state); });
    return () => { active = false; };
  }, []);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(userErrorMessage(error, '잠시 뒤 다시 해 주세요.')); } finally { setBusy(false); }
  };
  const search = () => run(async () => {
    const found = await searchElementarySchools(keyword);
    setResults(found); setPicked(null);
    if (found.length === 0) setMessage('그 이름의 초등학교를 찾지 못했어요.');
  });
  const saveProfile = () => run(async () => {
    const school = picked ?? (profile ? { officeCode: profile.officeCode, schoolCode: profile.schoolCode, name: profile.schoolName, address: '' } : null);
    if (!school) throw new Error('학교를 찾아서 골라 주세요.');
    const next = { officeCode: school.officeCode, schoolCode: school.schoolCode, schoolName: school.name, grade: Number(grade), classNo: classNo.trim() };
    await saveSchoolProfile(next);
    setProfile(next); setEditing(false); setPlan(null); setMessage('학교·학년·반을 저장했어요.');
  });
  const load = (nextWeek: boolean) => run(async () => {
    if (!profile) throw new Error('학교·학년·반을 먼저 정해 주세요.');
    const dates = schoolWeekDates(new Date(), nextWeek);
    const rows = await fetchClassTimetable(profile, profile.grade, profile.classNo, dates[0], dates[4]);
    const next = buildWeekPlan(rows, dates);
    const periods = await getPeriods(await getDatabase());
    setPlan(next); setMissing(missingPeriods(next, periods.map((period) => period.periodNo)));
    if (next.every((day) => day.entries.length === 0)) setMessage('이 주에는 나이스에 들어 있는 시간표가 없어요.');
  });
  // 자동 갱신(P8.7)을 지금 바로 확인한다. 바뀌었으면 화면·알림을 다시 읽는다
  const checkNow = () => run(async () => {
    const state = await refreshSchoolTimetableIfDue(new Date(), true);
    if (!state) { setMessage('이 폰에서는 자동 갱신을 하지 않아요(아빠 폰이거나 아직 서버와 맞추기 전).'); return; }
    setAuto(state);
    if (state.result === 'updated') await onImported().catch(() => undefined);
  });
  const apply = () => {
    if (!plan) return;
    Alert.alert('학교 시간표를 바꿀까요?', '과목이 있는 요일의 \'학교\' 일정을 불러온 시간표로 바꾸고, 이 주의 시간표가 매주 반복돼요. 학교 일정에 넣어 둔 알림·메모는 초기화돼요. 학원·돌봄 일정과 비어 있는 요일은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: () => void run(async () => {
        const created = await runAdminEdit(async () => replaceSchoolItems(await getDatabase(), setId, plan));
        setPlan(null);
        try { await onImported(); setMessage(`학교 일정 ${created}개를 가져왔고 알림 예약도 새로 만들었어요.`); }
        catch { setMessage(`학교 일정 ${created}개를 가져왔지만 알림 예약을 다시 만들지 못했어요.`); }
      }) },
    ]);
  };

  const button = (label: string, onPress: () => void, primary = true, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled }} disabled={busy || disabled} onPress={onPress} style={[styles.button, primary ? { backgroundColor: colors.primary } : { borderColor: colors.primary, borderWidth: 2 }, (busy || disabled) && styles.dim]}><Text style={[styles.buttonText, { color: primary ? colors.onPrimary : colors.primary }]}>{label}</Text></Pressable>;
  const input = (value: string, onChange: (next: string) => void, placeholder: string, numeric = false) => <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={numeric ? 'number-pad' : 'default'} editable={!busy} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />;

  return <View style={styles.container}>
    <Text style={[styles.hint, { color: colors.textMuted }]}>나이스(학교가 입력한 시간표)에서 불러와요. 학교마다 빈칸이 있을 수 있어 미리 보고 확인한 뒤 바꿔요.</Text>
    {profile === undefined ? <Text style={[styles.hint, { color: colors.textMuted }]}>불러오는 중이에요.</Text> : !editing && profile ? <View style={styles.row}>
      <Text style={[styles.body, styles.flex, { color: colors.text }]}>{`${profile.schoolName} ${profile.grade}학년 ${profile.classNo}반`}</Text>
      {button('바꾸기', () => { setEditing(true); setGrade(String(profile.grade)); setClassNo(profile.classNo); }, false)}
    </View> : <View style={styles.container}>
      <View style={styles.row}><View style={styles.flex}>{input(keyword, setKeyword, '학교 이름 (예: 빛가온)')}</View>{button('찾기', () => void search())}</View>
      {results.map((school) => <Pressable key={`${school.officeCode}-${school.schoolCode}`} accessibilityRole="button" accessibilityState={{ selected: picked?.schoolCode === school.schoolCode }} onPress={() => setPicked(school)} style={[styles.result, { borderColor: picked?.schoolCode === school.schoolCode ? colors.primary : colors.border }]}>
        <Text style={[styles.body, { color: colors.text }]}>{picked?.schoolCode === school.schoolCode ? '✓ ' : ''}{school.name}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{school.address}</Text>
      </Pressable>)}
      {!picked && profile && <Text style={[styles.hint, { color: colors.textMuted }]}>{`지금 학교: ${profile.schoolName} (다른 학교를 고르지 않으면 그대로 써요)`}</Text>}
      <View style={styles.row}><View style={styles.flex}>{input(grade, setGrade, '학년 (1~6)', true)}</View><View style={styles.flex}>{input(classNo, setClassNo, '반', true)}</View></View>
      {button('학교·학년·반 저장', () => void saveProfile())}
    </View>}
    {profile && !editing && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.textMuted }]}>{auto ? `자동 갱신: ${formatSyncTime(auto.checkedAt)} 확인 — ${auto.message}` : '자동 갱신: 앱을 켤 때마다(6시간 간격) 이번 주 시간표를 확인해 바뀌면 학교 일정만 바꿔요.'}</Text>}
    {profile && !editing && <View style={styles.row}>{button('지금 나이스 확인', () => void checkNow())}</View>}
    {profile && !editing && <View style={styles.row}>{button('이번 주 불러오기', () => void load(false), false)}{button('다음 주 불러오기', () => void load(true), false)}</View>}
    {plan && <View style={[styles.preview, { borderColor: colors.border }]}>
      {plan.map((day) => <Text key={day.date} style={[styles.item, { color: day.entries.length ? colors.text : colors.textMuted }]}>{dayLine(day)}</Text>)}
      {missing.length > 0
        ? <Text style={[styles.body, { color: colors.danger, fontWeight: '700' }]}>{`교시 시간에 ${missing.join('·')}교시가 없어요. 위 '교시 시간'에서 먼저 정해 주세요.`}</Text>
        : button('이 시간표로 바꾸기', apply, true, plan.every((day) => day.entries.length === 0))}
    </View>}
    {message !== '' && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.text }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: adminSpacing.xs, width: '100%' },
  row: { alignItems: 'center', flexDirection: 'row', gap: adminSpacing.xs },
  flex: { flex: 1 },
  hint: { fontSize: adminFontSize.label },
  body: { fontSize: adminFontSize.body },
  item: { fontSize: adminFontSize.label, lineHeight: 20 },
  input: { borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
  result: { borderRadius: borderRadius.sm, borderWidth: 2, gap: 2, padding: adminSpacing.xs },
  preview: { borderRadius: borderRadius.sm, borderWidth: 1, gap: adminSpacing.xs, padding: adminSpacing.sm },
  dim: { opacity: 0.5 },
});
