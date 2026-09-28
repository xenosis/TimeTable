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
  it('saves and restores a selected bundled theme', async () => {
    const storage = memoryStorage();
    const store = createThemeSelectionStore(storage);

    await expect(store.select('sky-cloud')).resolves.toMatchObject({ id: 'sky-cloud' });
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id: 'sky-cloud' });
    expect(storage.setItemAsync).toHaveBeenCalledWith(SELECTED_THEME_KEY, 'sky-cloud');
  });

  it('uses the default theme for missing values and persists it for unknown stored values', async () => {
    await expect(createThemeSelectionStore(memoryStorage()).load()).resolves.toMatchObject({ id: 'daylight' });
    const storage = memoryStorage('no-longer-bundled');
    await expect(createThemeSelectionStore(storage).load()).resolves.toMatchObject({ id: 'daylight' });
    expect(storage.setItemAsync).toHaveBeenCalledWith(SELECTED_THEME_KEY, 'daylight');
  });

  it('uses the default theme when local storage cannot be read', async () => {
    const failingStorage = { getItemAsync: jest.fn(async () => { throw new Error('disk unavailable'); }), setItemAsync: jest.fn() };
    await expect(createThemeSelectionStore(failingStorage).load()).resolves.toMatchObject({ id: 'daylight' });
  });

  it('rejects an unknown selection without overwriting the saved theme', async () => {
    const storage = memoryStorage('sky-cloud');
    const store = createThemeSelectionStore(storage);

    await expect(store.select('not-a-theme')).rejects.toThrow('등록되지 않은 테마');
    await expect(store.load()).resolves.toMatchObject({ id: 'sky-cloud' });
    expect(storage.setItemAsync).not.toHaveBeenCalled();
  });
});
