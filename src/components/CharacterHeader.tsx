import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ThemeDefinition } from '../theme';
import { ThemeMascot } from './ThemeMascot';

/** Artwork occupies its own column and never overlays text or controls. */
export function CharacterHeader({ theme, children, compact = false }: PropsWithChildren<{ readonly theme: ThemeDefinition; readonly compact?: boolean }>) {
  const { width, fontScale } = useWindowDimensions();
  if (!theme.character) return <>{children}</>;
  const stacked = !compact && (width < 350 || fontScale > 1.3);
  const size = compact ? 52 : stacked ? 96 : 128;
  return <View style={[styles.frame, { backgroundColor: theme.character.softColor, borderColor: theme.decorations.cardBorder }, compact && styles.compact, stacked && styles.stacked]}>
    <View style={[styles.copy, stacked && styles.stackedCopy]}>{children}</View>
    <View style={styles.art}>
      {theme.character.motif === 'star' ? <Text accessible={false} style={[styles.motif, { color: theme.colors.primary }]}>✦</Text> : null}
      <ThemeMascot theme={theme} size={size} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 28, padding: 18 },
  compact: { borderRadius: 18, paddingVertical: 2, paddingHorizontal: 14 }, stacked: { flexDirection: 'column-reverse', alignItems: 'flex-start' },
  copy: { flex: 1, flexShrink: 1 }, art: { alignItems: 'center', justifyContent: 'center' },
  stackedCopy: { flex: 0, width: '100%' },
  motif: { position: 'absolute', right: 1, top: 3, fontSize: 15, opacity: 0.35 },
});
