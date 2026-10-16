import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TabsLayout from '../app/(tabs)/_layout';
import type { AccountState } from '../src/server/account';

let mockAccount: AccountState;
let mockPathname = '/';
let mockImmersive = false;
jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    usePathname: () => mockPathname,
    router: { replace: jest.fn(), push: jest.fn() },
    Slot: () => <MockText>딸 화면 슬롯</MockText>,
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/store/accountStore', () => ({
  useAccount: () => mockAccount,
  isParentDevice: (state: AccountState) => state.kind === 'signedIn' && state.membership?.role === 'parent',
}));
jest.mock('../src/theme/provider', () => ({ useActiveTheme: () => ({ theme: jest.requireActual<typeof import('../src/theme')>('../src/theme').defaultTheme }) }));
jest.mock('../src/store/immersiveMode', () => ({ useImmersive: () => mockImmersive }));
jest.mock('../src/components/ParentHome', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { ParentHome: () => <MockText>아빠 현황</MockText> };
});
jest.mock('../src/components/GemCollectionArtwork', () => ({ GemCollectionArtwork: () => null }));

const parent: AccountState = { kind: 'signedIn', email: 'dad@test.com', membership: { familyId: 'family-a', role: 'parent' }, offline: false };
const child: AccountState = { kind: 'signedIn', email: 'kid@test.com', membership: { familyId: 'family-a', role: 'child' }, offline: false };

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TabsLayout />); });
  return renderer;
}

const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(Text).map((node) => node.props.children);
const tabLabels = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.type !== 'string' && node.props.onPress)
  .map((node) => ({ label: node.props.accessibilityLabel as string, selected: Boolean(node.props.accessibilityState?.selected) }))
  .filter((tab, index, all) => all.findIndex((other) => other.label === tab.label) === index);

beforeEach(() => { mockPathname = '/'; mockImmersive = false; });

test('아빠 기기는 현황·시간표 탭과 설정만 보이고 보석 탭은 없다', async () => {
  mockAccount = parent;
  const renderer = await render();
  expect(tabLabels(renderer)).toEqual([{ label: '현황 탭', selected: true }, { label: '시간표 탭', selected: false }]);
  expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '관리자 설정 열기').length).toBeGreaterThan(0);
  expect(texts(renderer)).toContain('아빠 현황');
  expect(texts(renderer)).not.toContain('딸 화면 슬롯');
});

test('아빠 기기의 시간표 탭은 딸과 같은 시간표 화면(슬롯)을 그린다', async () => {
  mockAccount = parent;
  mockPathname = '/timetable';
  const renderer = await render();
  expect(tabLabels(renderer)).toEqual([{ label: '현황 탭', selected: false }, { label: '시간표 탭', selected: true }]);
  expect(texts(renderer)).toContain('딸 화면 슬롯');
  expect(texts(renderer)).not.toContain('아빠 현황');
});

test('아빠 기기가 보석 경로에 있으면 딸 보석 화면 대신 현황을 보인다', async () => {
  mockAccount = parent;
  mockPathname = '/stickers';
  const renderer = await render();
  expect(texts(renderer)).toContain('아빠 현황');
  expect(texts(renderer)).not.toContain('딸 화면 슬롯');
  expect(tabLabels(renderer)[0]).toEqual({ label: '현황 탭', selected: true });
});

test('딸 기기 탭 구성은 오늘·시간표·내 보석 그대로다', async () => {
  mockAccount = child;
  const renderer = await render();
  expect(tabLabels(renderer).map(({ label }) => label)).toEqual(['오늘 탭', '시간표 탭', '내 보석 탭']);
  expect(texts(renderer)).toContain('딸 화면 슬롯');
});

test('가로 주간 보기(몰입 모드)에서는 아빠 기기도 탭바를 숨긴다', async () => {
  mockAccount = parent;
  mockPathname = '/timetable';
  mockImmersive = true;
  const renderer = await render();
  expect(tabLabels(renderer)).toEqual([]);
});
