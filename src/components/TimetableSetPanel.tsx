import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import {
  createTimetableSet, deleteTimetableSet, listTimetableSets, renameTimetableSet, setActiveTimetableSet, type TimetableSetSummary,
} from '../db/timetableSetRepository';
import type { TimetableSet } from '../db/types';
import { requestRollingScheduleRefresh } from '../notifications/rollingRefresh';
import { fontSize, spacing, type ThemeDefinition } from '../theme';
import { refreshWidgetQuietly } from '../widgets/widgetRefresh';
import { TimetableSetCreate } from './TimetableSetCreate';
import { TimetableSetRow } from './TimetableSetRow';

/** 저장소가 한글로 알려 주는 오류(이름 중복 등)는 그대로, 그 밖의 오류는 일반 문구로 보여준다 */
function reportFailure(report: (message: string) => void, error: unknown, fallback: string): void {
  report(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : fallback);
}

/** 저장한 시간표 목록. 만들기·복사·이름 바꾸기·지우기·적용을 한곳에서 한다. */
export function TimetableSetPanel({ theme, activeSet, refreshKey, onApplied, onRenamed }: {
  readonly theme: ThemeDefinition;
  readonly activeSet: TimetableSet;
  readonly refreshKey: number;
  /** 다른 시간표를 적용했을 때 */
  readonly onApplied: (set: TimetableSet) => void;
  /** 지금 쓰는 시간표의 이름만 바뀌었을 때(알림 재예약은 필요 없고, 위젯 데이터의 이름은 이 패널이 다시 쓴다) */
  readonly onRenamed: (set: TimetableSet) => void;
}) {
  const [sets, setSets] = useState<readonly TimetableSetSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState('');
  const { colors } = theme;

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => listTimetableSets(database)).then((saved) => { if (active) setSets(saved); })
      .catch(() => { if (active) setMessage('시간표 목록을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [activeSet.id, activeSet.name, refreshKey, reload]);

  const run = useCallback(async (action: (database: Awaited<ReturnType<typeof getDatabase>>) => Promise<string>, fallback: string): Promise<boolean> => {
    setBusy(true);
    try {
      const message = await action(await getDatabase());
      setReload((value) => value + 1);
      setMessage(message);
      return true;
    } catch (error) {
      reportFailure(setMessage, error, fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const apply = async (set: TimetableSet) => {
    if (busy || set.id === activeSet.id) return;
    setBusy(true);
    try {
      await setActiveTimetableSet(await getDatabase(), set.id);
    } catch {
      setMessage('시간표를 바꾸지 못했어요.');
      setBusy(false);
      return;
    }
    // 적용은 이미 저장됐으므로 화면부터 새 시간표로 맞추고, 알림 재예약 실패는 따로 알린다
    onApplied(set);
    try {
      await requestRollingScheduleRefresh();
      setMessage(`'${set.name}' 시간표로 바꿨어요.`);
    } catch {
      setMessage(`'${set.name}' 시간표로 바꿨지만 알림을 다시 예약하지 못했어요. 잠시 뒤 다시 시도해 주세요.`);
    } finally {
      setBusy(false);
    }
  };

  const create = (name: string, copyFromActive: boolean) => run(async (database) => {
    await createTimetableSet(database, name, copyFromActive ? { copyFromSetId: activeSet.id } : {});
    return `'${name.trim()}' 시간표를 만들었어요. 목록에서 눌러 적용해요.`;
  }, '시간표를 만들지 못했어요.');

  const rename = (set: TimetableSetSummary, name: string) => run(async (database) => {
    await renameTimetableSet(database, set.id, name);
    if (set.id === activeSet.id) {
      onRenamed({ id: set.id, name: name.trim() });
      await refreshWidgetQuietly(); // 위젯 데이터에 들어 있는 시간표 이름도 바꾼다(알림 재예약은 필요 없다)
    }
    return `이름을 '${name.trim()}'(으)로 바꿨어요.`;
  }, '이름을 바꾸지 못했어요.');

  const remove = (set: TimetableSetSummary) => run(async (database) => {
    await deleteTimetableSet(database, set.id);
    return `'${set.name}' 시간표를 지웠어요.`;
  }, '시간표를 지우지 못했어요.');

  return <View style={styles.wrap}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>시간표 고르기</Text>
    <Text style={[styles.subtitle, { color: colors.textMuted }]}>{`지금은 '${activeSet.name}' 시간표를 보여 주고 있어요.`}</Text>
    <View style={styles.list}>
      {sets.map((set) => <TimetableSetRow
        key={set.id}
        theme={theme}
        set={set}
        active={set.id === activeSet.id}
        busy={busy}
        onApply={() => void apply(set)}
        onRename={(name) => rename(set, name)}
        onDelete={() => remove(set)}
      />)}
    </View>
    <TimetableSetCreate theme={theme} activeName={activeSet.name} busy={busy} onCreate={create} />
    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.text }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, width: '100%' },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { fontSize: fontSize.md },
  list: { gap: spacing.sm },
  message: { fontSize: fontSize.md, fontWeight: '700' },
});
