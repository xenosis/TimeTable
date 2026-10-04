import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getStickerSummary } from '../db/stickerRepository';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

/** 오늘 화면에 보여주는 보석 한 줄 요약. 자세히 보려면 내 보석 탭으로 이동한다. */
export function GemSummaryLine({ theme, refreshKey, onPress }: { readonly theme: ThemeDefinition; readonly refreshKey: number; readonly onPress: () => void }) {
  // 보석과 큰 보석은 종류가 달라 더하지 않고 각각 보여준다
  const [counts, setCounts] = useState<{ readonly gems: number; readonly largeGems: number } | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => { if (active) setCounts((previous) => previous === null ? undefined : previous); return getStickerSummary(database); }).then((summary) => { if (active) setCounts({ gems: summary.gems, largeGems: summary.largeGems }); }).catch(() => { if (active) setCounts(null); });
    return () => { active = false; };
  }, [refreshKey]);

  return <Pressable accessibilityRole="button" accessibilityLabel="내 보석판 보기" onPress={onPress} style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text style={styles.icon}>💎</Text><View style={styles.copy}><Text style={[styles.label, { color: theme.colors.textMuted }]}>차곡차곡 모은 보석</Text><Text style={[styles.text, { color: theme.colors.text }]}>{counts === undefined ? '불러오는 중…' : counts === null ? '불러오지 못했어요' : `작은 보석 ${counts.gems}개 · 큰 보석 ${counts.largeGems}개`}</Text></View>
    <Text style={[styles.link, { color: theme.colors.primary }]}>보기 ›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: borderRadius.lg, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: touchTarget.minimum, paddingHorizontal: 20, paddingVertical: spacing.md, width: '100%' },
  icon: { fontSize: 28 }, copy: { flex: 1, gap: 3 }, label: { fontSize: 14 },
  text: { fontSize: fontSize.md, fontWeight: '700' },
  link: { fontSize: fontSize.sm, fontWeight: '700' },
});
