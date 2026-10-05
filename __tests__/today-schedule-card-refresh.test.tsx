import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TodayScheduleCard } from '../src/components/TodayScheduleCard';
import { getTimetableItemsForWeekday, type TimetableItem } from '../src/db/timetableRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/timetableRepository', () => ({ getTimetableItemsForWeekday: jest.fn() }));

const item = { id: 1, title: '국어', startTime: '09:00', endTime: '09:40', category: 'school', colorKey: 'korean', iconKey: 'text', memo: '' } as TimetableItem;
const copy = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');

describe('오늘 일정 조회 상태', () => {
  let tree: ReactTestRenderer;
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 4, 9, 10)); jest.clearAllMocks(); });
  afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

  it.each([
    ['새로고침', 1, 1, false],
    ['세트 변경', 0, 2, true],
  ] as const)('같은 요일의 %s 조회 중 표시(새로고침은 이전 일정 유지, 세트 변경은 로딩)', async (_label, refreshKey, setId, loading) => {
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValueOnce([item]);
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1} />); });
    expect(copy(tree)).toContain('국어');
    let resolve!: (items: readonly TimetableItem[]) => void;
    jest.mocked(getTimetableItemsForWeekday).mockImplementationOnce(() => new Promise((res) => { resolve = res; }));
    await act(async () => { tree.update(<TodayScheduleCard theme={defaultTheme} refreshKey={refreshKey} setId={setId} />); });
    expect(copy(tree).includes('오늘 일정을 불러오는 중이에요.')).toBe(loading);
    expect(copy(tree).includes('국어')).toBe(!loading);
    await act(async () => { resolve([item]); });
    expect(copy(tree)).toContain('국어');
    expect(copy(tree)).not.toContain('불러오는 중');
  });
  it('새로고침이 실패하면 이전 일정을 남기지 않고 오류를 알린다', async () => {
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValueOnce([item]).mockRejectedValueOnce(new Error('temporary'));
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1} />); });
    await act(async () => { tree.update(<TodayScheduleCard theme={defaultTheme} refreshKey={1} setId={1} />); });
    expect(copy(tree)).toContain('오늘 일정을 불러오지 못했어요.');
    expect(copy(tree)).not.toContain('국어');
    // 재시도 응답 전에는 실패 전 일정이 다시 나타나지 않는다
    jest.mocked(getTimetableItemsForWeekday).mockImplementationOnce(() => new Promise(() => undefined));
    const retry = tree.root.findAll((node) => node.props.accessibilityLabel === '일정 다시 불러오기' && typeof node.props.onPress === 'function')[0];
    await act(async () => { retry.props.onPress(); });
    expect(copy(tree)).toContain('오늘 일정을 불러오는 중이에요.');
    expect(copy(tree)).not.toContain('국어');
  });
  it('복귀 새로고침 직후 종료 경계를 넘긴 현재 시각으로 판정한다', async () => {
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValue([item]);
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1} />); });
    expect(copy(tree)).toContain('지금 하고 있어요');
    jest.setSystemTime(new Date(2026, 9, 4, 9, 41));
    await act(async () => { tree.update(<TodayScheduleCard theme={defaultTheme} refreshKey={1} setId={1} />); });
    expect(copy(tree)).toContain('오늘 일정이 끝났어요.');
    expect(copy(tree)).not.toContain('지금 하고 있어요');
  });
  it('다른 남은 일정은 체크 목록 뒤에서 펼치고 지금·다음과 지난 일정을 반복하지 않는다', async () => {
    const next = { ...item, id: 2, title: '수학', startTime: '10:00', endTime: '10:40' };
    const later = { ...item, id: 3, title: '미술', startTime: '11:00', endTime: '11:40', memo: '앞치마 준비' };
    const past = { ...item, id: 4, title: '아침 독서', startTime: '08:00', endTime: '08:30' };
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValue([later, past, next, item]);
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1}><Text>할 일 체크</Text></TodayScheduleCard>); });
    expect(copy(tree)).toMatch(/다른 남은 일정\s+1\s+개/);
    expect(copy(tree)).not.toContain('미술');
    const toggle = () => tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
    act(() => toggle().props.onPress());
    const text = copy(tree);
    expect(text.indexOf('할 일 체크')).toBeLessThan(text.indexOf('미술'));
    expect(text).toContain('앞치마 준비');
    expect(text).not.toContain('아침 독서');
    expect(text.match(/국어/g)).toHaveLength(1);
    expect(text.match(/수학/g)).toHaveLength(1);
    act(() => toggle().props.onPress());
    expect(copy(tree)).not.toContain('미술');
  });
  it('일정 세트를 아직 못 읽어도 할 일 슬롯은 유지하고 이전 일정은 숨긴다', async () => {
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValue([item]);
    const screen = (setId: number | null) => <TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={setId}><Text>할 일 체크</Text></TodayScheduleCard>;
    await act(async () => { tree = create(screen(1)); });
    const child = tree.root.findAllByType(Text).find((node) => node.props.children === '할 일 체크');
    await act(async () => { tree.update(screen(null)); });
    expect(copy(tree)).toBe('할 일 체크');
    expect(tree.root.findAllByType(Text)[0]).toBe(child);
  });
  it('항목 조회 실패를 한 번 알리고 재시도 버튼으로 복구한다', async () => {
    jest.mocked(getTimetableItemsForWeekday).mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce([item]);
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1} />); });
    expect(copy(tree).match(/오늘 일정을 불러오지 못했어요/g)).toHaveLength(1);
    const retry = tree.root.findAll((node) => node.props.accessibilityLabel === '일정 다시 불러오기' && typeof node.props.onPress === 'function')[0];
    await act(async () => { retry.props.onPress(); });
    expect(copy(tree)).toContain('국어');
    expect(copy(tree)).not.toContain('불러오지 못했어요');
  });
  it('시간 경과만으로 추가 일정이 다음과 지금으로 이동하고 종료 후 사라진다', async () => {
    const next = { ...item, id: 2, title: '수학', startTime: '09:40', endTime: '10:00' };
    const later = { ...item, id: 3, title: '미술', startTime: '10:00', endTime: '10:40' };
    jest.mocked(getTimetableItemsForWeekday).mockResolvedValue([later, next, item]);
    await act(async () => { tree = create(<TodayScheduleCard theme={defaultTheme} refreshKey={0} setId={1} />); });
    expect(copy(tree)).toMatch(/다른 남은 일정\s+1\s+개/);
    const toggle = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
    act(() => toggle.props.onPress());
    expect(copy(tree)).toContain('미술');
    await act(async () => { jest.advanceTimersByTime(30 * 60 * 1000); });
    expect(copy(tree)).not.toContain('국어');
    expect(copy(tree)).not.toContain('다른 남은 일정');
    expect(copy(tree)).toContain('수학');
    expect(copy(tree)).toContain('미술');
    await act(async () => { jest.advanceTimersByTime(20 * 60 * 1000); });
    expect(copy(tree)).not.toContain('수학');
    expect(copy(tree)).toContain('지금 하고 있어요');
    await act(async () => { jest.advanceTimersByTime(40 * 60 * 1000); });
    expect(copy(tree)).toContain('오늘 일정이 끝났어요.');
    expect(copy(tree)).not.toContain('미술');
  });
});
