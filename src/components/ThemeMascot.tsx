import { Image, StyleSheet, View } from 'react-native';
import type { ThemeDefinition } from '../theme';

const characterImages = {
  cinnamon: require('../../assets/characters/cinnamon-cloud.png'),
  kuromi: require('../../assets/characters/kuromi-star.png'),
} as const;
const emptyImages = {
  cinnamon: require('../../assets/characters/cinnamon-empty.png'),
  kuromi: require('../../assets/characters/kuromi-empty.png'),
} as const;

export function ThemeMascot({ theme, size = 112, empty = false }: { readonly theme: ThemeDefinition; readonly size?: number; readonly empty?: boolean }) {
  if (!theme.character) return null;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: size, height: size }}>
    <Image source={(empty ? emptyImages : characterImages)[theme.character.id]} resizeMode="contain" fadeDuration={0} style={styles.image} />
  </View>;
}

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
