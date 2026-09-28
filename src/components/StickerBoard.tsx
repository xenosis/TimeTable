import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../db/database';
import { getCompletedDates, getStickerSummary, type StickerSummary } from '../db/stickerRepository';
import { completedDayStreak } from '../utils/streak';
import { borderRadius, fontSize, spacing, type ThemeDefinition } from '../theme';

const glyph = (shape: ThemeDefinition['decorations']['stickerShape']) => shape === 'heart' ? '♥' : shape === 'star' ? '★' : '●';
export function StickerBoard({ theme, refreshKey }: { readonly theme: ThemeDefinition; readonly refreshKey: number }) {
  const [summary, setSummary] = useState<StickerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    let active = true;
    void getDatabase().then(async (database) => {
      const nextSummary = await getStickerSummary(database);
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nextStreak = completedDayStreak(await getCompletedDates(database), today);
      if (!active) return;
      setSummary(nextSummary);
      setStreak(nextStreak);
      setLoading(false);
    }).catch(() => { if (active) { setSummary(null); setLoading(false); } });
    return () => { active = false; };
  }, [refreshKey]);
  if (loading) return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}><Text style={[styles.title, { color: theme.colors.text }]}>내 보석판</Text><Text style={{ color: theme.colors.textMuted }}>불러오는 중이에요…</Text></View>;
  if (!summary) return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}><Text style={[styles.title, { color: theme.colors.text }]}>내 보석판</Text><Text style={{ color: theme.colors.textMuted }}>보석판을 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.</Text></View>;
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}><Text style={[styles.title, { color: theme.colors.text }]}>내 보석판</Text><Text style={[styles.sticker, { color: theme.decorations.stickerAccent }]}>{glyph(theme.decorations.stickerShape)} 보석 {summary.gems}개</Text><Text style={[styles.sticker, { color: theme.decorations.stickerAccent }]}>{glyph(theme.decorations.stickerShape)}{glyph(theme.decorations.stickerShape)} 큰 보석 {summary.largeGems}개</Text><Text style={{ color: theme.colors.textMuted }}>{streak}일 연속 완료!</Text><Text style={{ color: theme.colors.textMuted }}>{summary.remaining === null ? '다음 보상 목표를 정해 주세요.' : `${summary.goal?.title}: 보석 ${summary.remaining}개 더 모으면 돼요.`}</Text></View>;
}
const styles = StyleSheet.create({ card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: spacing.lg, width: '100%' }, title: { fontSize: fontSize.lg, fontWeight: '700' }, sticker: { fontSize: fontSize.lg, fontWeight: '700' } });
