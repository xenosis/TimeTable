import { Image, StyleSheet, View } from 'react-native';

const gemstones = {
  gem: require('../../assets/characters/gem-small.png'),
  'large-gem': require('../../assets/characters/gem-large.png'),
} as const;

export function GemCollectionArtwork({ kind, size }: { readonly kind: keyof typeof gemstones; readonly size?: number }) {
  const width = size ?? (kind === 'large-gem' ? 80 : 62);
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width, height: size ?? 80 }}>
    <Image source={gemstones[kind]} resizeMode="contain" fadeDuration={0} style={styles.image} />
  </View>;
}
const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
