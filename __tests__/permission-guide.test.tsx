import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { PermissionGuide } from '../src/components/PermissionGuide';
import { defaultTheme } from '../src/theme';

const mockStatus = jest.fn();
jest.mock('../src/notifications/secureAlarmPoc', () => ({
  getAndroidPermissionStatus: () => mockStatus(),
  openAndroidPermissionSettings: jest.fn(),
  requestAndroidNotificationPermission: jest.fn(),
}));

const allowed = { notifications: true, exactAlarms: true, fullScreen: true, battery: true };
const texts = (node: ReactTestInstance): string => node.findAll((child) => (child.type as unknown) === 'Text').map((child) => child.children.filter((value) => typeof value === 'string').join('')).join(' | ');
const labels = (node: ReactTestInstance): string[] => node.findAll((child) => typeof child.props.accessibilityLabel === 'string').map((child) => child.props.accessibilityLabel as string);

async function render(collapseWhenReady = true) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PermissionGuide theme={defaultTheme} collapseWhenReady={collapseWhenReady} />); });
  await act(async () => { await Promise.resolve(); });
  return renderer.root;
}

beforeEach(() => mockStatus.mockReset());

// 관리자 화면 알림 준비 안내의 네 가지 상태(P9.2 기준, P9.7 확인 항목): 모두 허용·일부 부족·조회 실패·수동 펼치기
test('모두 허용이면 한 줄로 접히고, 눌러서 펼칠 수 있다', async () => {
  mockStatus.mockResolvedValue(allowed);
  const root = await render();
  expect(texts(root)).toContain('알림 준비: 모두 허용됨');
  const open = root.find((node) => node.props.accessibilityLabel === '알림 준비 열기' && typeof node.props.onPress === 'function');
  await act(async () => { open.props.onPress(); });
  expect(texts(root)).toContain('알림: 허용됨');
  expect(labels(root)).toContain('알림 준비 접기');
});

test('하나라도 부족하면 펼친 채로 그 권한의 허용하기 버튼을 보인다', async () => {
  mockStatus.mockResolvedValue({ ...allowed, notifications: false });
  const root = await render();
  expect(texts(root)).toContain('알림: 확인이 필요해요');
  expect(labels(root)).toContain('알림 설정 열기');
  expect(labels(root)).not.toContain('알림 준비 열기');
});

test('상태 조회에 실패하면 허용 완료로 접지 않고 오류와 다시 확인 버튼을 보인다', async () => {
  mockStatus.mockRejectedValue(new Error('native unavailable'));
  const root = await render();
  expect(texts(root)).toContain('권한 상태를 다시 확인하지 못했어요');
  expect(texts(root)).not.toContain('모두 허용됨');
  expect(labels(root)).toContain('권한 다시 확인');
  // 다시 확인이 성공하면 접힌다
  mockStatus.mockResolvedValue(allowed);
  const retry = root.find((node) => node.props.accessibilityLabel === '권한 다시 확인' && typeof node.props.onPress === 'function');
  await act(async () => { retry.props.onPress(); await Promise.resolve(); });
  expect(texts(root)).toContain('알림 준비: 모두 허용됨');
});
