import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../db/database';
import { currentStreak } from '../db/gemRightRepository';
import { getStickerSummary, type StickerSummary } from '../db/stickerRepository';
import type { ThemeDefinition } from '../theme';
import { GemArtwork } from './GemArtwork';
import { GemCollectionArtwork } from './GemCollectionArtwork';
import { GemCountEditor } from './GemCountEditor';
import { GemRightsCard } from './GemRightsCard';

export function StickerBoard({ theme, refreshKey }: { readonly theme: ThemeDefinition; readonly refreshKey: number }) {
  const [summary, setSummary] = useState<StickerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [countRefresh, setCountRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void getDatabase().then(async (database) => {
      if (active) setLoading(true);
      const nextSummary = await getStickerSummary(database);
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nextStreak = await currentStreak(database, today); // 할 일이 없는 날은 건너뛰는 연속 일수(보석 받기 카드와 같은 계산)
      if (!active) return;
      setSummary(nextSummary); setStreak(nextStreak); setLoading(false);
    }).catch(() => { if (active) { setSummary(null); setLoading(false); } });
    return () => { active = false; };
  }, [refreshKey, countRefresh]);
  const { colors } = theme;
  const card = { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder };
  if (!summary) return <View style={[styles.card, card]}><Text style={[styles.sectionTitle, { color: colors.text }]}>{loading ? '보석을 꺼내고 있어요…' : '보석을 불러오지 못했어요.'}</Text><Text style={[styles.body, { color: colors.textMuted }]}>{loading ? '잠깐만 기다려 주세요.' : '잠시 뒤 다시 확인해 주세요.'}</Text></View>;
  const goalProgress = summary.goal ? Math.max(0, Math.min(summary.total, summary.goal.stickerGoal)) : 0;
  const progress = summary.goal ? goalProgress / summary.goal.stickerGoal : 0;
  const ready = summary.remaining === 0;
  return <View style={styles.container}>
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.onPrimary }]}>차곡차곡 모은 작은 보석</Text>
          <View style={styles.balanceRow}>{/* 작은 보석과 큰 보석은 더하지 않고 각각 보여준다(합계는 쓰지 않는다). 개수는 딸이 직접 고치는 값이다 */}
          <Text style={[styles.balance, { color: colors.onPrimary }]}>{summary.gems}</Text><Text style={[styles.unit, { color: colors.onPrimary }]}>개</Text></View>
          <Text style={[styles.heroNote, { color: colors.onPrimary }]}>{`큰 보석 ${summary.largeGems}개`}</Text>
        </View>
        <GemArtwork theme={theme} counts={summary} />
      </View>
      <View style={[styles.heroFooter, { borderTopColor: `${colors.onPrimary}40` }]}><Text style={[styles.heroNote, { color: colors.onPrimary }]}>{streak > 0 ? `✦ ${streak}일 연속으로 해냈어요!` : '작은 실천이 반짝이는 보석이 돼요'}</Text></View>
    </View>
    {/* 연속 5일 달성 → 실물 보석을 받을 자격과 '아빠한테 보석 달라고 하기'(앱의 보석 개수는 바꾸지 않는다). 정책은 docs/backlog/P4.13.md */}
    <GemRightsCard theme={theme} refreshKey={refreshKey} />
    <View style={[styles.card, card]}>
      <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.text }]}>나의 다음 선물</Text><Text style={styles.gift}>🎁</Text></View>
      {summary.goal ? <>
        <Text style={[styles.goalTitle, { color: colors.text }]}>{summary.goal.title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{ready ? '목표를 채웠어요! 아빠에게 알려 주세요.' : `보석 ${summary.remaining}개 더 모으면 만날 수 있어요`}</Text>
        <View accessibilityRole="progressbar" accessibilityLabel="선물 목표 진행률" accessibilityValue={{ min: 0, max: summary.goal.stickerGoal, now: goalProgress }} style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} /></View>
        <View style={styles.sectionRow}><Text style={[styles.progressCopy, { color: colors.primary }]}>{ready ? '목표 달성 ✨' : '조금씩, 꾸준히!'}</Text><Text style={[styles.progressCopy, { color: colors.textMuted }]}>{summary.total} / {summary.goal.stickerGoal}개</Text></View>
      </> : <Text style={[styles.body, { color: colors.textMuted }]}>어떤 선물을 받고 싶나요? 아빠와 다음 보상 목표를 정해 보세요.</Text>}
    </View>
    <View style={styles.sectionRow}><Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>내 보석 컬렉션</Text><Pressable accessibilityRole="button" accessibilityLabel="보석 개수 수정" onPress={() => setEditorOpen(true)} style={styles.editButton}><Text style={[styles.progressCopy, { color: colors.primary }]}>개수 수정 ✎</Text></Pressable></View>
    <View style={styles.collection}>
      <View style={[styles.collectionCard, card]}><GemCollectionArtwork kind="gem" /><Text style={[styles.collectionCount, { color: colors.text }]}>{summary.gems}<Text style={styles.collectionUnit}> 개</Text></Text><Text style={[styles.collectionLabel, { color: colors.textMuted }]}>작은 보석</Text></View>
      <View style={[styles.collectionCard, card]}><GemCollectionArtwork kind="large-gem" /><Text style={[styles.collectionCount, { color: colors.text }]}>{summary.largeGems}<Text style={styles.collectionUnit}> 개</Text></Text><Text style={[styles.collectionLabel, { color: colors.textMuted }]}>큰 보석</Text></View>
    </View>
    <View style={[styles.tip, { backgroundColor: colors.surface }]}><Text style={styles.tipIcon}>✨</Text><Text style={[styles.tipText, { color: colors.textMuted }]}>실물로 받은 보석을 여기서 관리해요.{'\n'}보석을 세어 보고 개수를 바꿔 주세요!</Text></View>
    {editorOpen ? <GemCountEditor counts={summary} theme={theme} onSaved={() => setCountRefresh((value) => value + 1)} onClose={() => setEditorOpen(false)} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 16, width: '100%' }, hero: { borderRadius: 28, padding: 22, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, heroCopy: { flex: 1 }, eyebrow: { fontSize: 15, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, balance: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], flexShrink: 1 }, unit: { fontSize: 17, fontWeight: '700' },
  heroFooter: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 }, heroNote: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 24, borderWidth: 1, gap: 12, padding: 20 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' }, gift: { fontSize: 20 }, goalTitle: { fontSize: 20, fontWeight: '800' }, body: { fontSize: 15, lineHeight: 24 },
  editButton: { minHeight: 56, minWidth: 88, alignItems: 'center', justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 4 }, fill: { height: '100%', borderRadius: 5 }, progressCopy: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  collection: { flexDirection: 'row', gap: 12 }, collectionCard: { flex: 1, borderWidth: 1, borderRadius: 24, padding: 18, gap: 6 },
  collectionIcon: { fontSize: 22 }, collectionCount: { fontSize: 24, fontWeight: '800' }, collectionUnit: { fontSize: 15, fontWeight: '600' }, collectionLabel: { fontSize: 15, fontWeight: '600' },
  tip: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 16 }, tipIcon: { fontSize: 19 }, tipText: { flex: 1, fontSize: 14, lineHeight: 23 },
});
