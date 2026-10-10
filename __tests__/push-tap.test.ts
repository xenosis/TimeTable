import { setAccount } from '../src/store/accountStore';
import { syncTappedFamilyPush } from '../src/push/pushTap';

const mockSync = jest.fn();
jest.mock('../src/sync/syncRunner', () => ({
  syncTarget: (account: { kind: string; membership?: unknown }) => account.kind === 'signedIn' ? account.membership : null,
  runSync: (target: unknown, options: unknown) => mockSync(target, options),
}));
beforeEach(() => { jest.clearAllMocks(); mockSync.mockResolvedValue(true); });
afterEach(() => setAccount({ kind: 'checking' }));

test('현재 딸 가족의 알림 탭만 동기화하고 다른 가족·아빠·로그아웃은 무시한다', async () => {
  setAccount({ kind: 'signedIn', email: 'kid@test.com', membership: { role: 'child', familyId: 'family-a' }, offline: false });
  await expect(syncTappedFamilyPush('family-a')).resolves.toBe(true);
  expect(mockSync).toHaveBeenCalledWith({ familyId: 'family-a', role: 'child' }, { fresh: true });
  await expect(syncTappedFamilyPush('family-b')).resolves.toBe(false);
  setAccount({ kind: 'signedIn', email: 'dad@test.com', membership: { role: 'parent', familyId: 'family-a' }, offline: false });
  await expect(syncTappedFamilyPush('family-a')).resolves.toBe(false);
  setAccount({ kind: 'local' });
  await expect(syncTappedFamilyPush('family-a')).resolves.toBe(false);
  expect(mockSync).toHaveBeenCalledTimes(1);
});
