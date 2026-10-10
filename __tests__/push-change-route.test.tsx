import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import PushChangeRoute from '../app/push-change';
import type { AccountState } from '../src/server/account';
import { Text } from 'react-native';

let mockAccount: AccountState;
const mockSync = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ familyId: 'family-a' }), useRouter: () => mockRouter }));
jest.mock('../src/store/accountStore', () => ({ useAccount: () => mockAccount }));
jest.mock('../src/push/pushTap', () => ({ syncTappedFamilyPush: (...args: unknown[]) => mockSync(...args) }));

test('앱이 꺼진 상태의 알림 탭은 계정 복원과 동기화를 마친 뒤 홈으로 이동한다', async () => {
  jest.clearAllMocks();
  mockAccount = { kind: 'checking' };
  let finish!: (value: boolean) => void;
  mockSync.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<PushChangeRoute />); });
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  mockAccount = { kind: 'signedIn', email: 'kid@test.com', membership: null, offline: true, restoring: true };
  await act(async () => { renderer.update(<PushChangeRoute />); });
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  mockAccount = { kind: 'signedIn', email: 'kid@test.com', membership: { familyId: 'family-a', role: 'child' }, offline: false };
  await act(async () => { renderer.update(<PushChangeRoute />); });
  expect(mockSync).toHaveBeenCalledWith('family-a');
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => { finish(true); });
  expect(mockReplace).toHaveBeenCalledWith('/');
  await act(async () => renderer.unmount());
});

test('통신 실패는 안내와 재시도를 보여 주며 최신 적용 성공 뒤 홈으로 간다', async () => {
  jest.clearAllMocks();
  mockAccount = { kind: 'signedIn', email: 'kid@test.com', membership: { familyId: 'family-a', role: 'child' }, offline: false };
  mockSync.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<PushChangeRoute />); });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).some((node) => String(node.props.children).includes('새 내용을 맞추는 작업을 끝내지 못했어요'))).toBe(true);
  await act(async () => { renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(mockSync).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenCalledWith('/');
  await act(async () => renderer.unmount());
});
