import { contrastRatio } from '../src/theme/contrast';
import {
  assertValidTheme,
  assertValidRegistry,
  categoryPalette,
  colors,
  defaultTheme,
  defaultThemeId,
  getTheme,
  resolveThemeCategory,
  resolveThemeColor,
  resolveThemeIcon,
  scheduleSemanticDefaults,
  themes,
} from '../src/theme';

const legacyPalette = [
  ['korean', '#4F46E5', '#FFFFFF'], ['math', '#10B981', '#1E293B'], ['english', '#F59E0B', '#1E293B'],
  ['science', '#2563EB', '#FFFFFF'], ['music', '#DB2777', '#FFFFFF'], ['art', '#7C3AED', '#FFFFFF'],
  ['physical-education', '#F97316', '#1E293B'], ['other', '#14B8A6', '#1E293B'],
];
const legacyColors = {
  background: '#F8FAFC', surface: '#FFFFFF', primary: '#4F46E5', onPrimary: '#FFFFFF', secondary: '#10B981',
  text: '#1E293B', textMuted: '#64748B', border: '#E2E8F0', success: '#22C55E', warning: '#F59E0B', danger: '#EF4444',
};
const legacyDecorations = {
  cardBackground: '#FFFFFF', cardBorder: '#E2E8F0', accentShape: 'circle', stickerShape: 'star', stickerAccent: '#A16207',
};
const alternateTheme = {
  ...defaultTheme,
  id: 'alternate-test',
  name: '검증용 테마',
  colors: { ...defaultTheme.colors, primary: '#075985', onPrimary: '#FFFFFF' },
  categories: defaultTheme.categories.map((category) => category.key === 'math'
    ? { ...category, backgroundColor: '#047857', textColor: '#FFFFFF' }
    : category),
  icons: defaultTheme.icons.map((icon) => icon.key === 'music-note'
    ? { ...icon, glyph: '♫' }
    : icon),
};

describe('categoryPalette', () => {
  it('uses unique keys and readable text contrast', () => {
    expect(new Set(categoryPalette.map((category) => category.key)).size).toBe(categoryPalette.length);

    for (const category of categoryPalette) {
      expect(contrastRatio(category.textColor, category.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('theme registry', () => {
  it('uses the default theme for an unknown saved theme id', () => {
    expect(getTheme(defaultThemeId)).toBe(defaultTheme);
    expect(getTheme('removed-theme')).toBe(defaultTheme);
  });

  it('keeps all required text contrast pairs readable in every bundled theme', () => {
    for (const theme of themes) {
      const pairs = [
        [theme.colors.text, theme.colors.background],
        [theme.colors.textMuted, theme.colors.background],
        [theme.colors.text, theme.colors.surface],
        [theme.colors.textMuted, theme.colors.surface],
        [theme.colors.onPrimary, theme.colors.primary],
        [theme.colors.primary, theme.colors.background],
        [theme.colors.text, theme.decorations.cardBackground],
        [theme.colors.textMuted, theme.decorations.cardBackground],
        ...theme.categories.map((category) => [category.textColor, category.backgroundColor]),
      ];
      for (const [foreground, background] of pairs) {
        expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses the other category and icon for unknown semantic keys in every bundled theme', () => {
    for (const theme of themes) {
      expect(resolveThemeCategory(theme, 'unknown-subject').key).toBe('other');
      expect(resolveThemeColor(theme, 'unknown-color').key).toBe('other');
      expect(resolveThemeIcon(theme, 'unknown-icon').key).toBe('other');
    }
  });

  it('resolves color and icon keys independently with a safe fallback', () => {
    expect(resolveThemeColor(defaultTheme, 'math').backgroundColor).toBe('#10B981');
    expect(resolveThemeIcon(defaultTheme, 'music-note').glyph).toBe('♪');
    expect(resolveThemeColor(defaultTheme, null).key).toBe('other');
    expect(resolveThemeIcon(defaultTheme, undefined).key).toBe('other');
  });

  it('keeps the previous default-theme exports and validates the registry', () => {
    expect(themes).toContain(defaultTheme);
    expect(themes).toHaveLength(2);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(themes.length);
    expect(colors).toBe(defaultTheme.colors);
    expect(categoryPalette).toBe(defaultTheme.categories);
    expect(categoryPalette.map(({ key, backgroundColor, textColor }) => [key, backgroundColor, textColor])).toEqual(expect.arrayContaining(legacyPalette));
    expect(colors).toEqual(legacyColors);
    expect(defaultTheme.decorations).toEqual(legacyDecorations);
    expect(Object.isFrozen(defaultTheme)).toBe(true);
    expect(Object.isFrozen(defaultTheme.colors)).toBe(true);
    expect(() => assertValidTheme({ ...defaultTheme, categories: [] })).toThrow('비어 있을 수 없습니다');
    expect(() => assertValidRegistry([defaultTheme, { ...defaultTheme }])).toThrow('레지스트리에서 고유');
    expect(() => assertValidRegistry([{ ...defaultTheme, colors: { ...defaultTheme.colors, primary: '#075985' } }])).toThrow('기본 테마 정의는 변경할 수 없습니다');
    expect(() => assertValidRegistry([defaultTheme, { ...defaultTheme, id: 'missing-math', categories: defaultTheme.categories.filter(({ key }) => key !== 'math') }])).toThrow('color_key를 모두 지원');
    expect(() => assertValidRegistry([defaultTheme, { ...defaultTheme, id: 'missing-music', icons: defaultTheme.icons.filter(({ key }) => key !== 'music-note') }])).toThrow('icon_key를 모두 지원');
    expect(resolveThemeColor({ ...defaultTheme }, 'math').key).toBe('math');
    expect(resolveThemeIcon(defaultTheme, 'music-note').key).toBe('music-note');
    expect(() => assertValidTheme({ ...defaultTheme, id: ' daylight ' })).toThrow('앞뒤 공백');
    expect(() => assertValidRegistry([defaultTheme, { ...defaultTheme, id: 'renamed-math', categories: defaultTheme.categories.map((category) => category.key === 'math' ? { ...category, label: '다른 뜻' } : category) }])).toThrow('의미 라벨');
    expect(resolveThemeColor(defaultTheme, 'academy').key).toBe('academy');
    expect(resolveThemeColor(defaultTheme, 'life').key).toBe('life');
    expect(resolveThemeIcon(defaultTheme, 'academy').key).toBe('academy');
    expect(resolveThemeIcon(defaultTheme, 'art-tool').glyph).toBe('✦');
    expect(resolveThemeIcon(defaultTheme, 'other').glyph).toBe('•');
    expect(scheduleSemanticDefaults.math).toEqual({ colorKey: 'math', iconKey: 'number' });
    expect(scheduleSemanticDefaults.life).toEqual({ colorKey: 'life', iconKey: 'life' });
    const twoThemeRegistry = assertValidRegistry([defaultTheme, alternateTheme]);
    expect(twoThemeRegistry).toHaveLength(2);
    expect(twoThemeRegistry[1]!.categories.find(({ key }) => key === 'math')?.backgroundColor).toBe('#047857');
    expect(defaultTheme.categories.find(({ key }) => key === 'math')?.backgroundColor).toBe('#10B981');
    expect(resolveThemeColor(twoThemeRegistry[1]!, 'math', twoThemeRegistry).backgroundColor).toBe('#047857');
    expect(resolveThemeIcon(twoThemeRegistry[1]!, 'music-note', twoThemeRegistry).glyph).toBe('♫');
    expect(getTheme('sky-cloud')).toMatchObject({ id: 'sky-cloud' });
    expect(() => getTheme(defaultThemeId, [defaultTheme])).toThrow('검증되지 않은 테마 레지스트리');
    expect(() => assertValidTheme({ ...defaultTheme, categories: defaultTheme.categories.map((category) => category.key === 'math' ? { ...category, textColor: '#10B981' } : category) })).toThrow('대비는 4.5:1');
    expect(() => assertValidTheme({ ...defaultTheme, colors: { ...defaultTheme.colors, text: '#F8FAFC' } })).toThrow('대비는 4.5:1');
    expect(() => assertValidTheme({ ...defaultTheme, colors: { ...defaultTheme.colors, textMuted: '#F8FAFC' } })).toThrow('대비는 4.5:1');
    expect(() => assertValidTheme({ ...defaultTheme, colors: { ...defaultTheme.colors, secondary: undefined } as unknown as typeof defaultTheme.colors })).toThrow('필수 colors');
    expect(() => assertValidTheme({ ...defaultTheme, decorations: { ...defaultTheme.decorations, stickerShape: 'diamond' as 'star' } })).toThrow('장식 색상과 도형');
    expect(() => assertValidTheme({ ...defaultTheme, icons: defaultTheme.icons.map((icon) => icon.key === 'text' ? { ...icon, glyph: '' } : icon) })).toThrow('단일 glyph');
    expect(() => assertValidTheme({ ...defaultTheme, icons: defaultTheme.icons.map((icon) => icon.key === 'text' ? { ...icon, glyph: ' ' } : icon) })).toThrow('공백이 아닌 단일 glyph');
    expect(() => assertValidTheme({ ...defaultTheme, categories: defaultTheme.categories.map((category) => category.key === 'math' ? { ...category, backgroundColor: 'blue' } : category) })).toThrow('색상이 유효');
    expect(() => assertValidTheme({ ...defaultTheme, categories: [...defaultTheme.categories, defaultTheme.categories[0]!] })).toThrow('고유');
    expect(Object.isFrozen(defaultTheme.categories)).toBe(true);
    expect(Object.isFrozen(defaultTheme.categories[0]!)).toBe(true);
    expect(() => assertValidRegistry([{ ...defaultTheme, id: 'without-default' }])).toThrow('기본 테마가 레지스트리에 필요');
  });
});
