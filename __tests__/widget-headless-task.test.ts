import { AppRegistry } from 'react-native';

import { requestWidgetRefresh } from '../src/widgets/widgetRefresh';

jest.mock('../src/widgets/widgetRefresh', () => ({ requestWidgetRefresh: jest.fn() }));

describe('위젯 체크 즉시 반영 작업', () => {
  const register = jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation(() => undefined);
  // 등록 호출을 관찰하려고 spy를 건 뒤에 모듈을 불러온다
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WIDGET_CHECKS_HEADLESS_TASK, applyWidgetChecksInBackground } = require('../src/widgets/widgetHeadlessTask') as typeof import('../src/widgets/widgetHeadlessTask');

  it('네이티브 서비스와 같은 이름으로 등록한다', () => {
    expect(WIDGET_CHECKS_HEADLESS_TASK).toBe('TimeTableWidgetChecks');
    expect(register).toHaveBeenCalledWith('TimeTableWidgetChecks', expect.any(Function));
    const provider = register.mock.calls[0][1] as () => unknown;
    expect(provider()).toBe(applyWidgetChecksInBackground);
  });

  it('위젯 갱신 흐름(대기 체크 기록·알림 재예약)을 실행한다', async () => {
    jest.mocked(requestWidgetRefresh).mockResolvedValueOnce(undefined);
    await applyWidgetChecksInBackground();
    expect(requestWidgetRefresh).toHaveBeenCalledTimes(1);
  });

  it('실패해도 작업을 오류로 끝내지 않는다(대기 체크는 다음에 다시 시도)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(requestWidgetRefresh).mockRejectedValueOnce(new Error('db busy'));
    await expect(applyWidgetChecksInBackground()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
