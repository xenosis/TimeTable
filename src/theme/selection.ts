import Storage from 'expo-sqlite/kv-store';

import { defaultThemeId, getTheme, themes, type ThemeDefinition } from './index';

const SELECTED_THEME_KEY = 'kidtimetable.selected-theme-id';

export type ThemeIdStorage = Pick<typeof Storage, 'getItemAsync' | 'setItemAsync'>;

export function createThemeSelectionStore(storage: ThemeIdStorage) {
  return {
    async load(): Promise<ThemeDefinition> {
      try {
        const savedThemeId = await storage.getItemAsync(SELECTED_THEME_KEY);
        if (savedThemeId && !themes.some((theme) => theme.id === savedThemeId)) {
          await storage.setItemAsync(SELECTED_THEME_KEY, defaultThemeId);
          return getTheme(defaultThemeId);
        }
        return getTheme(savedThemeId);
      } catch {
        return getTheme(defaultThemeId);
      }
    },
    async select(themeId: string): Promise<ThemeDefinition> {
      if (!themes.some((theme) => theme.id === themeId)) {
        throw new Error(`등록되지 않은 테마는 선택할 수 없습니다: ${themeId}`);
      }
      const theme = getTheme(themeId);
      await storage.setItemAsync(SELECTED_THEME_KEY, theme.id);
      return theme;
    },
  };
}

export const themeSelectionStore = createThemeSelectionStore(Storage);
export { SELECTED_THEME_KEY, defaultThemeId };
