import { act, create } from 'react-test-renderer';
import { ScheduleGridViewport } from '../src/components/ScheduleGridViewport';
import { defaultTheme, spacing } from '../src/theme';

it('상위 레이아웃이 배정한 실제 높이에서 카드 여백과 테두리를 제외한다', () => {
  const child = jest.fn(() => null);
  let tree!: ReturnType<typeof create>;
  try {
    act(() => { tree = create(<ScheduleGridViewport theme={defaultTheme} card>{child}</ScheduleGridViewport>); });
    const layout = (height: number) => tree.root.findByProps({ testID: 'schedule-viewport' }).props.onLayout({ nativeEvent: { layout: { height } } });
    act(() => layout(620));
    expect(child).toHaveBeenLastCalledWith(620 - (spacing.sm + 2) * 2);
    act(() => layout(280));
    expect(child).toHaveBeenLastCalledWith(280 - (spacing.sm + 2) * 2);
  } finally { act(() => tree?.unmount()); }
});
