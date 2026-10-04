import type { ThemeDefinition } from './index';

export type ThemeCharacter = {
  readonly id: 'cinnamon' | 'kuromi';
  readonly greeting: string;
  readonly motif: 'cloud' | 'star';
  readonly softColor: string;
};

/** Subject colors/icons keep their meaning; only the surrounding character world changes. */
export function createCharacterThemes(base: ThemeDefinition): readonly ThemeDefinition[] {
  return [
    {
      ...base, id: 'cinnamon-cloud', name: '시나모롤 구름', description: '폭신한 구름 위에서 함께하는 하루',
      colors: { ...base.colors, background: '#F0F9FF', primary: '#075985', secondary: '#0E7490', text: '#172554', textMuted: '#475569', border: '#BAE6FD' },
      decorations: { ...base.decorations, cardBorder: '#BAE6FD', accentShape: 'heart', stickerShape: 'heart', stickerAccent: '#075985' },
      character: { id: 'cinnamon', greeting: '구름처럼 가볍게, 하나씩 해봐요!', motif: 'cloud', softColor: '#DDF1FF' },
    },
    {
      ...base, id: 'kuromi-star', name: '쿠로미 별', description: '보랏빛 반짝임과 나만의 멋진 하루',
      colors: { ...base.colors, background: '#F8F3FF', primary: '#6B21A8', secondary: '#9D174D', text: '#2E1065', textMuted: '#62516F', border: '#DDD0F4' },
      decorations: { ...base.decorations, cardBorder: '#DDD0F4', accentShape: 'star', stickerShape: 'star', stickerAccent: '#6B21A8' },
      character: { id: 'kuromi', greeting: '오늘도 나답게, 반짝이는 하루!', motif: 'star', softColor: '#EDE4FA' },
    },
  ];
}
