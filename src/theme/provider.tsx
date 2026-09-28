import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { defaultTheme, type ThemeDefinition } from './index';
import { themeSelectionStore } from './selection';

type ActiveThemeContextValue = {
  readonly theme: ThemeDefinition;
  readonly selectTheme: (themeId: string) => Promise<void>;
};

const ActiveThemeContext = createContext<ActiveThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeDefinition>(defaultTheme);
  const [isReady, setIsReady] = useState(false);
  const selectionQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    themeSelectionStore.load().then((savedTheme) => {
      if (mounted) setTheme(savedTheme);
    }).finally(() => {
      if (mounted) setIsReady(true);
    });
    return () => { mounted = false; };
  }, []);

  const value = useMemo<ActiveThemeContextValue>(() => ({
    theme,
    async selectTheme(themeId: string) {
      const queuedSelection = selectionQueue.current.then(async () => {
        const selectedTheme = await themeSelectionStore.select(themeId);
        setTheme(selectedTheme);
        return selectedTheme;
      });
      selectionQueue.current = queuedSelection.catch(() => undefined);
      await queuedSelection;
    },
  }), [theme]);

  if (!isReady) return null;
  return <ActiveThemeContext.Provider value={value}>{children}</ActiveThemeContext.Provider>;
}

export function useActiveTheme(): ActiveThemeContextValue {
  const value = useContext(ActiveThemeContext);
  if (!value) throw new Error('useActiveTheme은 ThemeProvider 안에서 사용해야 합니다.');
  return value;
}
