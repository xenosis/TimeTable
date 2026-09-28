import * as SecureStore from 'expo-secure-store';
import { getPinLockUntil, hashPin, recordPinFailure } from '../src/security/pin';

jest.mock('expo-secure-store', () => ({ deleteItemAsync: jest.fn(), getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

describe('PIN security', () => {
  beforeEach(() => jest.clearAllMocks());
  it('returns the standard SHA-256 value without retaining the PIN', () => { expect(hashPin('1234')).toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'); });
  it('starts from one failed attempt after an expired lock', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ attempts: 5, until: Date.now() - 1 }));
    await expect(recordPinFailure()).resolves.toBe(0);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('timetable.pin.lock.v1', JSON.stringify({ attempts: 1, until: 0 }));
  });
  it('clears an expired lock before the next PIN check', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ attempts: 5, until: Date.now() - 1 }));
    await expect(getPinLockUntil()).resolves.toBe(0);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('timetable.pin.lock.v1');
  });
});
