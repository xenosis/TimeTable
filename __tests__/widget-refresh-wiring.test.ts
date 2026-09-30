const mockRefreshWidget = jest.fn(async () => undefined);
let mockReplaceTimetable: () => Promise<number> = async () => 1;

jest.mock('../src/widgets/widgetRefresh', () => ({ refreshWidgetQuietly: () => mockRefreshWidget() }));
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({ getAllAsync: async () => [] }) }));
jest.mock('../src/db/timetableSetRepository', () => ({ getActiveTimetableSet: async () => ({ id: 1, name: '평소' }) }));
jest.mock('../src/notifications/rollingSchedule', () => ({ replaceTimetableRollingNotificationsFromDatabase: () => mockReplaceTimetable() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { requestRollingScheduleRefresh } = require('../src/notifications/rollingRefresh') as typeof import('../src/notifications/rollingRefresh');
/* eslint-enable @typescript-eslint/no-require-imports */

// 할 일 쪽(taskRollingSchedule)도 같은 try/finally 구조지만, 이 함수는 최초 커밋부터 DB를 동적 import()로 불러와
// Jest 환경에서 직접 실행할 수 없다(기존 rolling-refresh-lifecycle 테스트도 이 함수를 통째로 목으로 대체한다).
// 그래서 이 테스트는 시간표 쪽만 직접 검증하고, 할 일 쪽은 코드 구조의 동일성과 에뮬레이터 확인에 의존한다.

beforeEach(() => {
  mockRefreshWidget.mockClear();
  mockReplaceTimetable = async () => 1;
});

describe('시간표 알림 재예약과 위젯 갱신의 연결', () => {
  it('재예약이 끝나면 위젯도 갱신한다', async () => {
    await requestRollingScheduleRefresh();
    expect(mockRefreshWidget).toHaveBeenCalledTimes(1);
  });

  it('알림 재예약이 실패해도(권한 부족 등) 위젯은 갱신하고, 재예약 오류는 그대로 전달한다', async () => {
    mockReplaceTimetable = async () => { throw new Error('배터리 최적화 예외가 필요해요'); };
    await expect(requestRollingScheduleRefresh()).rejects.toThrow('배터리 최적화');
    expect(mockRefreshWidget).toHaveBeenCalledTimes(1);
  });
});
