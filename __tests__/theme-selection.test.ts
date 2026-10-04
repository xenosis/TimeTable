import { createThemeSelectionStore, SELECTED_THEME_KEY } from '../src/theme/selection';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemAsync: jest.fn(), setItemAsync: jest.fn() },
}));

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItemAsync: jest.fn(async () => value),
    setItemAsync: jest.fn(async (_key: string, next: string) => { value = next; }),
  };
}

describe('theme selection storage', () => {
  it.each(['daylight', 'sky-cloud'])('migrates removed %s selection to the cloud character', async (id) => {
    const storage = memoryStorage(id);
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id: 'cinnamon-cloud' });
    expect(storage.setItemAsync).toHaveBeenCalledWith(SELECTED_THEME_KEY, 'cinnamon-cloud');
    await expect(createThemeSelectionStore(storage).select(id)).rejects.toThrow('등록되지 않은 테마');
  });
  it.each(['cinnamon-cloud', 'kuromi-star'])('restores the saved %s character after recreating the store', async (id) => {
    const storage = memoryStorage();
    await createThemeSelectionStore(storage).select(id);
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id });
  });
  it('saves and restores a selected bundled theme', async () => {
    const storage = memoryStorage();
    const store = createThemeSelectionStore(storage);

    await expect(store.select('kuromi-star')).resolves.toMatchObject({ id: 'kuromi-star' });
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id: 'kuromi-star' });
    expect(storage.setItemAsync).toHaveBeenCalledWith(SELECTED_THEME_KEY, 'kuromi-star');
  });

  it('uses the default theme for missing values and persists it for unknown stored values', async () => {
    await expect(createThemeSelectionStore(memoryStorage()).load()).resolves.toMatchObject({ id: 'cinnamon-cloud' });
    const storage = memoryStorage('no-longer-bundled');
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id: 'cinnamon-cloud' });
    expect(storage.setItemAsync).toHaveBeenCalledWith(SELECTED_THEME_KEY, 'cinnamon-cloud');
  });

  it('uses the default theme when local storage cannot be read', async () => {
    const failingStorage = { getItemAsync: jest.fn(async () => { throw new Error('disk unavailable'); }), setItemAsync: jest.fn() };
    await expect(createThemeSelectionStore(failingStorage).load()).resolves.toMatchObject({ id: 'cinnamon-cloud' });
  });

  it('rejects an unknown selection without overwriting the saved theme', async () => {
    const storage = memoryStorage('kuromi-star');
    const store = createThemeSelectionStore(storage);

    await expect(store.select('not-a-theme')).rejects.toThrow('등록되지 않은 테마');
    await expect(store.load()).resolves.toMatchObject({ id: 'kuromi-star' });
    expect(storage.setItemAsync).not.toHaveBeenCalled();
  });
});
