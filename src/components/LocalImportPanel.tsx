import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { canImport, importAlreadyDone, importLocalData, type ImportCounts } from '../server/localImport';
import { useAccount } from '../store/accountStore';
import { userErrorMessage } from '../utils/userErrorMessage';

/** 관리자 '기타 → 서버 연결' 아래: 딸 폰의 로컬 데이터를 서버로 처음 한 번 올린다(P6.5). 딸 계정으로 로그인한 폰에서만 보인다. */
export function LocalImportPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  if (!canImport(account)) return null;
  const familyId = account.membership.familyId;
  const done = importAlreadyDone(familyId);

  const upload = async () => {
    setBusy(true);
    setMessage('');
    try {
      setMessage(`서버에 올렸어요. ${importSummary(await importLocalData(familyId))}`);
    } catch (error) {
      setMessage(userErrorMessage(error, '서버로 올리지 못했어요. 이 폰의 데이터는 그대로예요.'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return <View style={[styles.container, { borderColor: theme.decorations.cardBorder }]}>
    <Text style={[styles.title, { color: theme.colors.text }]}>이 폰의 데이터를 서버로 처음 올리기</Text>
    <Text style={[styles.body, { color: theme.colors.textMuted }]}>
      {done ? '이 폰의 데이터는 이미 서버에 올렸어요.' : '시간표·할 일·보석 기록을 서버로 한 번 올려요. 이 폰의 데이터는 지워지지 않아요. 서버에 이미 데이터가 있으면 올리지 않아요.'}
    </Text>
    {!done && (confirming ? <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void upload()} style={[styles.button, styles.flex, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{busy ? '올리는 중' : '네, 올릴게요'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirming(false)} style={[styles.button, styles.flex, { borderColor: theme.colors.border, borderWidth: 1 }]}>
        <Text style={[styles.buttonText, { color: theme.colors.text }]}>취소</Text>
      </Pressable>
    </View> : <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>서버로 올리기</Text>
    </Pressable>)}
    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.colors.text }]}>{message}</Text>}
  </View>;
}

/** 올린 개수를 사람이 읽는 한 줄로. 테스트에서 확인할 수 있게 내보낸다. */
export function importSummary(counts: ImportCounts): string {
  return `시간표 항목 ${counts.timetable_items}개, 할 일 ${counts.tasks}개, 완료 기록 ${counts.task_completion_history}개, 보석 기록 ${counts.sticker_ledger + counts.gem_rights}개`;
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, gap: adminSpacing.xs, marginTop: adminSpacing.sm, paddingTop: adminSpacing.sm, width: '100%' },
  title: { fontSize: adminFontSize.body, fontWeight: '700' },
  body: { fontSize: adminFontSize.label, lineHeight: 20 },
  row: { flexDirection: 'row', gap: adminSpacing.xs },
  flex: { flex: 1 },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
