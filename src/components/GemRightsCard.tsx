import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getGemRightSummary, requestAvailableRights, type GemRightSummary } from '../db/gemRightRepository';
import { rewardPolicy } from '../rewards/rewardPolicy';
import type { ThemeDefinition } from '../theme';
import { ThemedProgressMark } from './ThemedProgressMark';
import { requestSyncSoon } from '../sync/syncSoon';

const todayKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/** 딸 화면의 "보석 받기" 카드: 연속 달성 진행, 받을 수 있는 보석 수, 아빠에게 요청하기. 앱의 보석 개수는 바꾸지 않는다. */
export function GemRightsCard({ theme, refreshKey }: { readonly theme: ThemeDefinition; readonly refreshKey: number }) {
  const [summary, setSummary] = useState<GemRightSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const { colors } = theme;

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => getGemRightSummary(database, todayKey())).then((next) => { if (active) { setSummary(next); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refreshKey, reload]);

  if (!summary) return failed ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.textMuted }]}>보석 받기 정보를 불러오지 못했어요.</Text> : null;
  const days = rewardPolicy.giftStreakDays;
  const filled = summary.streak > 0 && summary.streak % days === 0 ? days : summary.streak % days;

  const request = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const count = await requestAvailableRights(await getDatabase());
      requestSyncSoon();
      setMessage(count > 0 ? `아빠에게 보석 ${count}개를 달라고 했어요!` : '');
      setReload((value) => value + 1);
    } catch { setMessage('요청하지 못했어요. 다시 눌러 주세요.'); } finally { setBusy(false); }
  };

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <View style={styles.row}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>보석 받기</Text><Text style={styles.icon}>🎁</Text></View>
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: days, now: filled }} accessibilityLabel={`연속 ${summary.streak}일, ${days}일마다 보석을 받을 수 있어요`} style={styles.dots}>
      {Array.from({ length: days }, (_, index) => <ThemedProgressMark key={index} theme={theme} filled={index < filled} />)}
    </View>
    <Text style={[styles.body, { color: colors.text }]}>
      {summary.streak > 0 ? `${summary.streak}일 연속으로 해냈어요!` : '오늘 할 일을 모두 끝내면 연속이 시작돼요.'}
      {summary.streak > 0 && filled < days ? ` ${summary.daysToNext}일 더 하면 보석을 받을 수 있어요.` : ''}
    </Text>
    {summary.available > 0 && <>
      <Text style={[styles.count, { color: colors.primary }]}>{`받을 수 있는 보석 ${summary.available}개`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="아빠한테 보석 달라고 하기" disabled={busy} onPress={() => void request()} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>아빠한테 보석 달라고 하기</Text>
      </Pressable>
    </>}
    {summary.requested > 0 && <Text style={[styles.body, { color: colors.textMuted }]}>{`아빠에게 보석 ${summary.requested}개를 달라고 했어요. 조금만 기다려요!`}</Text>}
    {message !== '' && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.primary }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, gap: 12, padding: 20 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700' }, icon: { fontSize: 20 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  body: { fontSize: 15, lineHeight: 24 }, count: { fontSize: 19, fontWeight: '800' },
  button: { alignItems: 'center', borderRadius: 16, justifyContent: 'center', minHeight: 56, paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
