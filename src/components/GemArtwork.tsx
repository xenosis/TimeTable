import { StyleSheet, Text, View } from 'react-native';
import type { ThemeDefinition } from '../theme';
import { gemVisualStage } from '../theme/gemVisualStage';
import { GemCollectionArtwork } from './GemCollectionArtwork';
import { ThemeMascot } from './ThemeMascot';

export function GemArtwork({ theme, counts }: { readonly theme: ThemeDefinition; readonly counts: { readonly gems: number; readonly largeGems: number } }) {
  const stage = gemVisualStage(counts);
  return <View style={styles.scene}>
    <View style={styles.picture} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      {stage.tier > 1 ? <View style={[styles.halo, { backgroundColor: theme.character?.softColor ?? theme.colors.onPrimary, opacity: stage.tier * 0.07 }]} /> : null}
      {theme.character ? <ThemeMascot theme={theme} size={132} empty={stage.tier === 0} /> : stage.tier > 0 ? <GemCollectionArtwork kind={stage.tier >= 3 ? 'large-gem' : 'gem'} size={96} /> : <Text style={[styles.empty, { color: theme.colors.onPrimary }]}>♡</Text>}
      {stage.tier >= 2 ? <Text style={[styles.sparkle, { color: theme.colors.onPrimary }]}>✦</Text> : null}
      {stage.tier >= 3 ? <Text style={[styles.smallSparkle, { color: theme.colors.onPrimary }]}>✧</Text> : null}
      <View style={styles.pile}>{Array.from({ length: Math.max(0, stage.tier - 1) }, (_, index) => <View key={index} style={{ transform: [{ rotate: `${index % 2 ? 12 : -12}deg` }] }}><GemCollectionArtwork kind={index === 2 ? 'large-gem' : 'gem'} size={26 + index * 4} /></View>)}</View>
    </View>
    <Text style={[styles.caption, { color: theme.colors.onPrimary }]}>{stage.label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  scene: { width: 132, alignItems: 'center', gap: 4 }, picture: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 116, height: 116, borderRadius: 58 },
  sparkle: { position: 'absolute', top: 2, right: 1, fontSize: 24 }, smallSparkle: { position: 'absolute', top: 20, left: 0, fontSize: 18 },
  pile: { position: 'absolute', bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }, empty: { fontSize: 66 },
  caption: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
