import { contrastRatio } from './contrast';
import { createCharacterThemes, type ThemeCharacter } from './characterThemes';

export type ThemeColors = {
  readonly background: string;
  readonly surface: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly secondary: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
};

// 시간표 데이터가 저장하는 색과 아이콘의 의미 체계는 서로 독립적이다.
// 테마는 이 의미를 바꾸지 않고, 각 키의 표시값만 바꿀 수 있다.
export const colorKeys = ['korean', 'math', 'english', 'science', 'music', 'art', 'physical-education', 'academy', 'life', 'other'] as const;
export const iconKeys = ['text', 'number', 'alphabet', 'experiment', 'music-note', 'art-tool', 'activity', 'academy', 'life', 'other'] as const;
export type ColorKey = (typeof colorKeys)[number];
export type IconKey = (typeof iconKeys)[number];
export const scheduleSemanticDefaults = {
  korean: { colorKey: 'korean', iconKey: 'text' }, math: { colorKey: 'math', iconKey: 'number' },
  english: { colorKey: 'english', iconKey: 'alphabet' }, science: { colorKey: 'science', iconKey: 'experiment' },
  music: { colorKey: 'music', iconKey: 'music-note' }, art: { colorKey: 'art', iconKey: 'art-tool' },
  'physical-education': { colorKey: 'physical-education', iconKey: 'activity' }, academy: { colorKey: 'academy', iconKey: 'academy' },
  life: { colorKey: 'life', iconKey: 'life' }, other: { colorKey: 'other', iconKey: 'other' },
} as const satisfies Readonly<Record<ColorKey, { readonly colorKey: ColorKey; readonly iconKey: IconKey }>>;

const colorLabels: Readonly<Record<ColorKey, string>> = {
  korean: '국어', math: '수학', english: '영어', science: '과학', music: '음악', art: '미술', 'physical-education': '체육', academy: '학원', life: '생활', other: '기타',
};
const iconLabels: Readonly<Record<IconKey, string>> = {
  text: '글자', number: '숫자', alphabet: '알파벳', experiment: '실험', 'music-note': '음표', 'art-tool': '미술 도구', activity: '활동', academy: '학원', life: '생활', other: '기타',
};

export type ThemeCategory = {
  readonly key: ColorKey;
  readonly label: string;
  readonly backgroundColor: string;
  readonly textColor: string;
};

export type ThemeIcon = {
  readonly key: IconKey;
  readonly label: string;
  readonly glyph: string;
};

export type ThemeDecorations = {
  readonly cardBackground: string;
  readonly cardBorder: string;
  readonly accentShape: 'circle' | 'star' | 'heart';
  readonly stickerShape: 'circle' | 'star' | 'heart';
  readonly stickerAccent: string;
};

export type ThemeDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly colors: ThemeColors;
  readonly categories: readonly ThemeCategory[];
  readonly icons: readonly ThemeIcon[];
  readonly decorations: ThemeDecorations;
  readonly character?: ThemeCharacter;
};

const themeColorKeys = ['background', 'surface', 'primary', 'onPrimary', 'secondary', 'text', 'textMuted', 'border', 'success', 'warning', 'danger'] as const satisfies readonly (keyof ThemeColors)[];
const decorationShapes = ['circle', 'star', 'heart'] as const;

const daylightCategories: readonly ThemeCategory[] = [
  { key: 'korean', label: '국어', backgroundColor: '#4F46E5', textColor: '#FFFFFF' },
  { key: 'math', label: '수학', backgroundColor: '#10B981', textColor: '#1E293B' },
  { key: 'english', label: '영어', backgroundColor: '#F59E0B', textColor: '#1E293B' },
  { key: 'science', label: '과학', backgroundColor: '#2563EB', textColor: '#FFFFFF' },
  { key: 'music', label: '음악', backgroundColor: '#DB2777', textColor: '#FFFFFF' },
  { key: 'art', label: '미술', backgroundColor: '#7C3AED', textColor: '#FFFFFF' },
  { key: 'physical-education', label: '체육', backgroundColor: '#F97316', textColor: '#1E293B' },
  { key: 'other', label: '기타', backgroundColor: '#14B8A6', textColor: '#1E293B' },
  { key: 'academy', label: '학원', backgroundColor: '#0F766E', textColor: '#FFFFFF' },
  { key: 'life', label: '생활', backgroundColor: '#9A3412', textColor: '#FFFFFF' },
];

const daylightIcons: readonly ThemeIcon[] = [
  { key: 'text', label: '글자', glyph: '가' },
  { key: 'number', label: '숫자', glyph: '+' },
  { key: 'alphabet', label: '알파벳', glyph: 'A' },
  { key: 'experiment', label: '실험', glyph: '●' },
  { key: 'music-note', label: '음표', glyph: '♪' },
  { key: 'art-tool', label: '미술 도구', glyph: '✦' },
  { key: 'activity', label: '활동', glyph: '★' },
  { key: 'other', label: '기타', glyph: '•' },
  { key: 'academy', label: '학원', glyph: '학' },
  { key: 'life', label: '생활', glyph: '♥' },
];

const defaultOtherCategory = daylightCategories.find((category) => category.key === 'other');
const defaultOtherIcon = daylightIcons.find((icon) => icon.key === 'other');
if (!defaultOtherCategory || !defaultOtherIcon) throw new Error('기본 테마에는 other fallback이 필요합니다.');

const daylightTheme = {
  id: 'daylight',
  name: '햇살 테마',
  description: '밝고 또렷한 기본 테마',
  colors: {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#4F46E5', // 인디고
  onPrimary: '#FFFFFF',
  secondary: '#10B981', // 에메랄드
  text: '#1E293B',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  },
  categories: daylightCategories,
  icons: daylightIcons,
  decorations: {
    cardBackground: '#FFFFFF',
    cardBorder: '#E2E8F0',
    accentShape: 'circle',
    stickerShape: 'star',
    stickerAccent: '#A16207',
  },
} satisfies ThemeDefinition;

const characterThemes = createCharacterThemes(daylightTheme);
const defaultThemeDefinition = characterThemes[0]!;
export const defaultThemeId = defaultThemeDefinition.id;
const validatedRegistries = new WeakSet<object>();

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function assertValidTheme(theme: ThemeDefinition): ThemeDefinition {
  const unique = (keys: readonly string[]) => new Set(keys).size === keys.length;
  if (!theme.id.trim() || !theme.name.trim() || !theme.description.trim()) throw new Error('테마 id·이름·설명이 필요합니다.');
  if (theme.id !== theme.id.trim()) throw new Error('테마 id 앞뒤 공백은 허용되지 않습니다.');
  if (!theme.categories.length || !theme.icons.length) throw new Error(`${theme.id}: 카테고리와 아이콘은 비어 있을 수 없습니다.`);
  if (!theme.categories.some((category) => category.key === 'other')) throw new Error(`${theme.id}: other 색상 fallback이 필요합니다.`);
  if (!theme.icons.some((icon) => icon.key === 'other')) throw new Error(`${theme.id}: other 아이콘 fallback이 필요합니다.`);
  if (!unique(theme.categories.map((category) => category.key))) throw new Error(`${theme.id}: 카테고리 key는 고유해야 합니다.`);
  if (!unique(theme.icons.map((icon) => icon.key))) throw new Error(`${theme.id}: 아이콘 key는 고유해야 합니다.`);
  if (!theme.colors || themeColorKeys.some((key) => !isHexColor(theme.colors[key]))) throw new Error(`${theme.id}: 필수 colors는 모두 6자리 hex여야 합니다.`);
  if (!theme.decorations
    || !isHexColor(theme.decorations.cardBackground)
    || !isHexColor(theme.decorations.cardBorder)
    || !isHexColor(theme.decorations.stickerAccent)
    || !decorationShapes.includes(theme.decorations.accentShape)
    || !decorationShapes.includes(theme.decorations.stickerShape)) {
    throw new Error(`${theme.id}: 장식 색상과 도형(circle, star, heart)이 유효해야 합니다.`);
  }
  if (theme.categories.some((category) => !category.key.trim() || !category.label.trim() || !isHexColor(category.backgroundColor) || !isHexColor(category.textColor))) {
    throw new Error(`${theme.id}: 카테고리 key·label·색상이 유효해야 합니다.`);
  }
  const requiredContrastPairs: readonly (readonly [string, string])[] = [
    [theme.colors.text, theme.colors.background],
    [theme.colors.textMuted, theme.colors.background],
    [theme.colors.text, theme.colors.surface],
    [theme.colors.textMuted, theme.colors.surface],
    [theme.colors.onPrimary, theme.colors.primary],
    [theme.colors.primary, theme.colors.background],
    [theme.colors.text, theme.decorations.cardBackground],
    [theme.colors.textMuted, theme.decorations.cardBackground],
    [theme.decorations.stickerAccent, theme.decorations.cardBackground],
    [theme.colors.text, theme.colors.success],
    ...theme.categories.map((category) => [category.textColor, category.backgroundColor] as const),
  ];
  if (requiredContrastPairs.some(([foreground, background]) => contrastRatio(foreground, background) < 4.5)) {
    throw new Error(`${theme.id}: 카테고리 텍스트 대비는 4.5:1 이상이어야 합니다.`);
  }
  if (theme.icons.some((icon) => !icon.key.trim() || !icon.label.trim() || !icon.glyph.trim() || Array.from(icon.glyph).length !== 1)) throw new Error(`${theme.id}: 아이콘 key·label·공백이 아닌 단일 glyph가 필요합니다.`);
  return theme;
}

function freezeTheme(theme: ThemeDefinition): ThemeDefinition {
  return Object.freeze({
    ...theme,
    colors: Object.freeze({ ...theme.colors }),
    categories: Object.freeze(theme.categories.map((category) => Object.freeze({ ...category }))),
    icons: Object.freeze(theme.icons.map((icon) => Object.freeze({ ...icon }))),
    decorations: Object.freeze({ ...theme.decorations }),
    ...(theme.character ? { character: Object.freeze({ ...theme.character }) } : {}),
  });
}

export function assertValidRegistry(registry: readonly ThemeDefinition[]): readonly ThemeDefinition[] {
  if (!registry.length) throw new Error('테마 레지스트리는 비어 있을 수 없습니다.');
  if (new Set(registry.map((theme) => theme.id)).size !== registry.length) throw new Error('테마 id는 레지스트리에서 고유해야 합니다.');
  const suppliedDefaultTheme = registry.find((theme) => theme.id === defaultThemeId);
  if (!suppliedDefaultTheme) throw new Error(`기본 테마가 레지스트리에 필요합니다: ${defaultThemeId}`);
  if (JSON.stringify(suppliedDefaultTheme) !== JSON.stringify(defaultThemeDefinition)) {
    throw new Error(`기본 테마 정의는 변경할 수 없습니다: ${defaultThemeId}`);
  }
  for (const theme of registry) {
    const colorKeySet = new Set(theme.categories.map((category) => category.key));
    const iconKeySet = new Set(theme.icons.map((icon) => icon.key));
    if (colorKeys.some((key) => !colorKeySet.has(key))) throw new Error(`${theme.id}: 기존 color_key를 모두 지원해야 합니다.`);
    if (iconKeys.some((key) => !iconKeySet.has(key))) throw new Error(`${theme.id}: 기존 icon_key를 모두 지원해야 합니다.`);
    if (colorKeySet.size !== colorKeys.length) throw new Error(`${theme.id}: 선언되지 않은 color_key는 허용되지 않습니다.`);
    if (iconKeySet.size !== iconKeys.length) throw new Error(`${theme.id}: 선언되지 않은 icon_key는 허용되지 않습니다.`);
    if (theme.categories.some((category) => category.label !== colorLabels[category.key])) throw new Error(`${theme.id}: color_key의 의미 라벨을 바꿀 수 없습니다.`);
    if (theme.icons.some((icon) => icon.label !== iconLabels[icon.key])) throw new Error(`${theme.id}: icon_key의 의미 라벨을 바꿀 수 없습니다.`);
  }
  const validated = Object.freeze(registry.map((theme) => freezeTheme(assertValidTheme(theme))));
  validatedRegistries.add(validated);
  return validated;
}

export const themes = assertValidRegistry(characterThemes);
export const defaultTheme: ThemeDefinition = themes.find((theme) => theme.id === defaultThemeId)
  ?? (() => { throw new Error(`기본 테마를 찾을 수 없습니다: ${defaultThemeId}`); })();

export function getTheme(themeId: string | null | undefined, registry: readonly ThemeDefinition[] = themes): ThemeDefinition {
  const validatedRegistry = requireValidatedRegistry(registry);
  return validatedRegistry.find((theme) => theme.id === themeId)
    ?? validatedRegistry.find((theme) => theme.id === defaultThemeId)
    ?? (() => { throw new Error(`기본 테마를 찾을 수 없습니다: ${defaultThemeId}`); })();
}

export function resolveThemeCategory(theme: ThemeDefinition, categoryKey: string | null | undefined, registry: readonly ThemeDefinition[] = themes): ThemeCategory {
  return resolveThemeColor(theme, categoryKey, registry);
}

export function resolveThemeColor(theme: ThemeDefinition, colorKey: string | null | undefined, registry: readonly ThemeDefinition[] = themes): ThemeCategory {
  const validatedRegistry = requireValidatedRegistry(registry);
  const registeredTheme = requireRegisteredTheme(theme, validatedRegistry);
  return registeredTheme.categories.find((category) => category.key === colorKey)
    ?? registeredTheme.categories.find((category) => category.key === 'other')
    ?? defaultOtherCategory!;
}

export function resolveThemeIcon(theme: ThemeDefinition, iconKey: string | null | undefined, registry: readonly ThemeDefinition[] = themes): ThemeIcon {
  const validatedRegistry = requireValidatedRegistry(registry);
  const registeredTheme = requireRegisteredTheme(theme, validatedRegistry);
  return registeredTheme.icons.find((icon) => icon.key === iconKey)
    ?? registeredTheme.icons.find((icon) => icon.key === 'other')
    ?? defaultOtherIcon!;
}

function requireRegisteredTheme(theme: ThemeDefinition, registry: readonly ThemeDefinition[]): ThemeDefinition {
  const registeredTheme = registry.find((candidate) => candidate.id === theme.id);
  if (!registeredTheme) throw new Error(`등록되지 않은 테마는 해석할 수 없습니다: ${theme.id}`);
  return registeredTheme;
}

function requireValidatedRegistry(registry: readonly ThemeDefinition[]): readonly ThemeDefinition[] {
  if (!validatedRegistries.has(registry)) {
    throw new Error('검증되지 않은 테마 레지스트리는 해석에 사용할 수 없습니다. assertValidRegistry()의 반환값을 사용하세요.');
  }
  return registry;
}

// 기존 화면과 테스트가 계속 기본 테마를 사용할 수 있도록 호환 export를 유지한다.
export const colors = defaultTheme.colors;
export const categoryPalette = defaultTheme.categories;

export { borderRadius, fontSize, spacing, touchTarget } from './layout';
