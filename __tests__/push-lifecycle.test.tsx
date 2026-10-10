import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PushLifecycle } from '../src/push/PushLifecycle';

let mockListener: (value: { data: string }) => void;
const mockRegister = jest.fn();
const mockRemove = jest.fn();
const mockAccount = { kind: 'local' };
jest.mock('../src/store/accountStore', () => ({ useAccount: () => mockAccount }));
jest.mock('../src/push/pushPolicy', () => ({ syncRemotePushFamily: async () => undefined }));
jest.mock('../src/push/familyPush', () => ({ registerChildPushToken: () => mockRegister() }));
jest.mock('expo-notifications', () => ({
  addPushTokenListener: (listener: typeof mockListener) => { mockListener = listener; return { remove: mockRemove }; },
}));

test('Android 토큰 조회가 같은 토큰 이벤트를 반복해도 등록이 연쇄 실행되지 않는다', async () => {
  mockRegister.mockImplementation(async () => { mockListener({ data: 'native-token-a' }); });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<PushLifecycle />); });
  expect(mockRegister).toHaveBeenCalledTimes(2);
  await act(async () => { mockListener({ data: 'native-token-a' }); });
  expect(mockRegister).toHaveBeenCalledTimes(2);
  mockRegister.mockImplementation(async () => { mockListener({ data: 'native-token-b' }); });
  await act(async () => { mockListener({ data: 'native-token-b' }); });
  expect(mockRegister).toHaveBeenCalledTimes(3);
  await act(async () => { renderer.unmount(); });
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
