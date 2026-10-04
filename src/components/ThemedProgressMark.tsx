import { StyleSheet, Text, View } from 'react-native';
import type { ThemeDefinition } from '../theme';

export function ThemedProgressMark({ theme, filled }: { readonly theme: ThemeDefinition; readonly filled: boolean }) {
  const color = filled ? (theme.character?.id === 'cinnamon' ? '#69BCEB' : theme.colors.primary) : theme.colors.border;
  const skullFill = filled ? '#F4A4CF' : theme.colors.surface;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.mark}>
    {theme.character?.motif === 'cloud' ? <>
      <View style={[styles.cloudBase, { backgroundColor: color }]} />
      <View style={[styles.cloudLeft, { backgroundColor: color }]} />
      <View style={[styles.cloudTop, { backgroundColor: color }]} />
      <View style={[styles.cloudRight, { backgroundColor: color }]} />
    </> : theme.character?.id === 'kuromi' ? <>
      <View style={[styles.skullHead, { backgroundColor: skullFill, borderColor: color }]}>
        <View style={[styles.eye, { backgroundColor: color }]} /><View style={[styles.eye, { backgroundColor: color }]} />
      </View>
      <View style={[styles.jaw, { backgroundColor: skullFill, borderColor: color }]}>
        <View style={[styles.toothGap, { backgroundColor: color }]} /><View style={[styles.toothGap, { backgroundColor: color }]} />
      </View>
    </> : <Text allowFontScaling={false} style={[styles.star, { color }]}>{'★\uFE0E'}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  mark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, star: { fontSize: 34 },
  cloudBase: { position: 'absolute', width: 36, height: 15, borderRadius: 8, left: 2, bottom: 7 },
  cloudLeft: { position: 'absolute', width: 18, height: 18, borderRadius: 9, left: 2, bottom: 12 },
  cloudTop: { position: 'absolute', width: 23, height: 23, borderRadius: 12, left: 10, top: 5 },
  cloudRight: { position: 'absolute', width: 17, height: 17, borderRadius: 9, right: 1, bottom: 12 },
  skullHead: { position: 'absolute', width: 32, height: 27, borderRadius: 14, borderWidth: 1.5, top: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  eye: { width: 7, height: 9, borderRadius: 4 }, jaw: { position: 'absolute', width: 20, height: 10, bottom: 3, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderWidth: 1.5, borderTopWidth: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  toothGap: { width: 1.5, height: 4 },
});
