import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { getDatabase } from '../db/database';
import { getStickerSummary } from '../db/stickerRepository';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

const glyph = (shape: ThemeDefinition['decorations']['stickerShape']) => shape === 'heart' ? '♥' : shape === 'star' ? '★' : '●';

/** 오늘 화면에 보여주는 보석 한 줄 요약. 자세히 보려면 내 보석 탭으로 이동한다. */
export function GemSummaryLine({ theme, refreshKey, onPress }: { readonly theme: ThemeDefinition; readonly refreshKey: number; readonly onPress: () => void }) {
  const [gems, setGems] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void getDatabase().then(getStickerSummary).then((summary) => { if (active) setGems(summary.gems); }).catch(() => { if (active) setGems(null); });
    return () => { active = false; };
  }, [refreshKey]);

  return <Pressable accessibilityRole="button" accessibilityLabel="내 보석판 보기" onPress={onPress} style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text style={[styles.text, { color: theme.decorations.stickerAccent }]}>{glyph(theme.decorations.stickerShape)} 보석 {gems ?? 0}개</Text>
    <Text style={[styles.link, { color: theme.colors.primary }]}>내 보석판 보기 →</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: borderRadius.lg, borderWidth: 2, flexDirection: 'row', justifyContent: 'space-between', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, width: '100%' },
  text: { fontSize: fontSize.md, fontWeight: '700' },
  link: { fontSize: fontSize.sm, fontWeight: '700' },
});
