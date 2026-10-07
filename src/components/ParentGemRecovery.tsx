import { useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { confirmParentGemRecovery, loadParentGemRecovery, type ParentGemRecovery as Recovery } from '../server/parentGemRecovery';
import { userErrorMessage } from '../utils/userErrorMessage';
import { type ThemeDefinition } from '../theme';
import { adminFontSize, adminTouchTarget } from '../theme/admin';

/** 결과를 알 수 없는 지급 기록은 서버 내역과 실제 지급을 확인한 뒤 수동으로 복구한다. */
export function ParentGemRecovery({ theme, onRecovered }: { theme: ThemeDefinition; onRecovered: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const confirm = async (reviewed: Recovery) => {
    setBusy(true);
    try { await confirmParentGemRecovery(reviewed); onRecovered(); }
    catch (error) { setMessage(userErrorMessage(error, '지급 내역을 확인하지 못했어요. 다시 확인해 주세요.')); }
    finally { setBusy(false); }
  };
  const review = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reviewed = await loadParentGemRecovery();
      const dates = reviewed.latestGiven.map((date) => date ? new Date(date).toLocaleString('ko-KR') : '시각 기록 없음').join('\n');
      Alert.alert('서버의 지급 내역을 확인해 주세요', `요청 ${reviewed.requested}개 · 지급 ${reviewed.given}개\n최근 지급 시각:\n${dates || '지급 없음'}\n\n실제로 준 보석이 이 내역에 맞는지 확인한 뒤 대기 기록을 다시 준비하세요. 서버 지급 기록과 보석 장부는 변경하지 않아요.`, [
        { text: '취소', style: 'cancel' },
        { text: '내역을 확인했어요', onPress: () => void confirm(reviewed) },
      ]);
    } catch (error) { setMessage(userErrorMessage(error, '서버 내역을 확인하지 못했어요.')); }
    finally { setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="지급 내역 확인 후 복구" disabled={busy} onPress={() => void review()} style={{ justifyContent: 'center', minHeight: adminTouchTarget }}>
      <Text style={{ color: theme.colors.primary, fontSize: adminFontSize.body }}>서버 지급 내역 확인 후 복구</Text>
    </Pressable>
    {message !== '' && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text, fontSize: adminFontSize.body }}>{message}</Text>}
  </>;
}
