import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getGemRightSummary, markRequestedGiven, type GemRightSummary } from '../db/gemRightRepository';
import { rewardPolicy } from '../rewards/rewardPolicy';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { requestSyncSoon } from '../sync/syncSoon';
import { getAccount, isParentDevice, useAccount } from '../store/accountStore';
import { markParentGemsGiven, pendingParentGemCount } from '../server/parentGemGiven';
import { hasSyncedFamily } from '../sync/syncMarkers';
import { subscribeWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { ParentGemRecovery } from './ParentGemRecovery';
import { userErrorMessage } from '../utils/userErrorMessage';
import type { AccountState } from '../server/account';

const todayKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const accountIdentity = (value: AccountState) => JSON.stringify(value.kind === 'signedIn' ? [value.kind, value.email, value.membership?.role, value.membership?.familyId] : [value.kind]);

/** 관리자(아빠) 화면: 딸이 요청한 실물 보석을 확인하고, 준 만큼 "줬어요"로 처리한다. 앱의 보석 개수(장부)는 바꾸지 않는다. */
export function GemRequestsPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const [summary, setSummary] = useState<GemRightSummary | null>(null);
  const [summaryFamily, setSummaryFamily] = useState<string | undefined>(undefined);
  const [given, setGiven] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const draft = useRef<{ familyId?: string; dirty: boolean }>({ dirty: false });
  const { colors } = theme;
  const familyId = account.kind === 'signedIn' ? account.membership?.familyId : undefined;
  const parentDevice = isParentDevice(account);
  const ready = !parentDevice || (familyId !== undefined && hasSyncedFamily(familyId));
  const pendingCount = parentDevice && familyId ? pendingParentGemCount(familyId) : 0;
  useEffect(() => subscribeWidgetChecksApplied(() => setReload((value) => value + 1)), []);

  useEffect(() => {
    let active = true;
    if (draft.current.familyId !== familyId) draft.current = { familyId, dirty: false };
    if (!ready) return () => { active = false; };
    void getDatabase().then((database) => getGemRightSummary(database, todayKey())).then((next) => {
      if (!active) return;
      setSummary(next);
      setSummaryFamily(familyId);
      if (pendingCount > 0 || !draft.current.dirty) setGiven(String(pendingCount > 0 ? pendingCount : next.requested));
    }).catch(() => { if (active) setMessage('보석 요청을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [reload, familyId, ready, pendingCount]);

  const askGiven = () => {
    if (busy) return;
    if (pendingCount < 0) { setMessage('이전 지급 기록을 확인하지 못했어요. 서버 지급 내역을 확인한 뒤 복구해 주세요.'); return; }
    if (!/^\d+$/.test(given)) { setMessage('준 개수를 숫자로 적어 주세요.'); return; }
    Alert.alert(`보석 ${Number(given)}개를 줬다고 기록할까요?`, '기록하면 되돌릴 수 없어요. 앱의 보석 개수는 바뀌지 않아요.', [{ text: '취소', style: 'cancel' }, { text: '기록하기', onPress: () => void confirmGiven() }]);
  };

  const confirmGiven = async () => {
    setBusy(true);
    try {
      if (accountIdentity(getAccount()) !== accountIdentity(account)) throw new Error('로그인 상태가 바뀌었어요. 지급 개수를 다시 확인해 주세요.');
      const count = isParentDevice(account) ? await markParentGemsGiven(Number(given)) : await markRequestedGiven(await getDatabase(), Number(given));
      requestSyncSoon();
      draft.current.dirty = false;
      setMessage(`보석 ${count}개를 줬다고 기록했어요. 앱의 보석 개수는 바뀌지 않아요.`);
      setReload((value) => value + 1);
    } catch (error) { setMessage(userErrorMessage(error, '지급을 기록하지 못했어요. 다시 확인해 주세요.')); } finally { setBusy(false); }
  };

  const showSummary = ready && summaryFamily === familyId;
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>보석 요청</Text>
    <Text style={[styles.hint, { color: colors.textMuted }]}>{`할 일을 모두 끝낸 날이 ${rewardPolicy.giftStreakDays}일 연속될 때마다 보석 1개를 받을 수 있어요.`}</Text>
    {showSummary && summary && <Text style={[styles.body, { color: colors.text }]}>{`요청 ${summary.requested}개 · 아직 요청 안 함 ${summary.available}개 · 지금까지 받음 ${summary.given}개`}</Text>}
    {parentDevice && <Text style={[styles.hint, { color: colors.textMuted }]}>지급 기록은 서버에 저장되고 딸 폰에도 반영돼요. 인터넷 연결이 필요해요.</Text>}
    {pendingCount < 0 && <>
      <Text style={[styles.hint, { color: colors.textMuted }]}>이전 지급 기록을 확인하지 못했어요. 서버 내역과 실제 지급을 확인해 주세요.</Text>
      <ParentGemRecovery theme={theme} onRecovered={() => { draft.current.dirty = false; setReload((value) => value + 1); setMessage('지급 대기를 다시 준비했어요. 아직 준 보석으로 기록되지는 않았어요.'); }} />
    </>}
    {showSummary && summary && (summary.requested > 0 || pendingCount > 0) && <View style={styles.row}>
      <TextInput accessibilityLabel="준 보석 개수" value={given} onChangeText={(value) => { draft.current.dirty = true; setGiven(value); }} keyboardType="number-pad" maxLength={3} editable={!busy} placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="보석을 줬어요" disabled={busy} onPress={askGiven} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}><Text style={[styles.buttonText, { color: colors.onPrimary }]}>줬어요</Text></Pressable>
    </View>}
    {showSummary && summary && summary.requested === 0 && pendingCount === 0 && <Text style={[styles.hint, { color: colors.textMuted }]}>지금 요청한 보석은 없어요.</Text>}
    <Text style={[styles.hint, { color: colors.textMuted }]}>앱의 보석 개수는 딸이 실물을 세어 직접 적어요. 줬어요를 눌러도 개수는 바뀌지 않아요.</Text>
    {message !== '' && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.text, fontWeight: '700' }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md, width: '100%' },
  title: { fontSize: adminFontSize.title, fontWeight: '700' },
  body: { fontSize: adminFontSize.body }, hint: { fontSize: adminFontSize.label },
  row: { alignItems: 'center', flexDirection: 'row', gap: adminSpacing.xs },
  input: { borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, minWidth: 72, paddingHorizontal: adminSpacing.sm, textAlign: 'center' },
  button: { alignItems: 'center', borderRadius: borderRadius.sm, flex: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
