import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { WeekTimeGrid } from '../src/components/WeekTimeGrid';
import { useTimetableView } from '../src/store/timetableView';
import { defaultTheme } from '../src/theme';
import { schoolGridDays } from '../src/utils/schoolGridDays';
import type { TimetableItem } from '../src/db/timetableRepository';

const item = (id: number, category: TimetableItem['category'], startTime: string, endTime: string, title = `${category} 일정`, periodNo?: number): TimetableItem => ({ id, category, startTime, endTime, title, periodNo, colorKey: 'science', iconKey: 'experiment', memo: '' });
const days = [
  { day: 1, items: [item(1, 'school', '09:00', '12:10'), item(2, 'life', '12:10', '13:00', '점심'), item(3, 'care', '13:00', '13:40')] },
  { day: 2, items: [item(4, 'school', '09:00', '12:10'), item(5, 'life', '12:10', '13:00', '점심'), item(6, 'school', '13:00', '13:40', '수학', 5), item(7, 'after_school', '13:50', '15:10')] },
];

it('오전·점심까지만 접고 5교시를 돌봄과 같은 시간대에 남긴다', () => {
  const visible = schoolGridDays(days, false);
  expect(visible[0].items.map((entry) => entry.id)).toEqual([3]);
  expect(visible[1].items.map((entry) => entry.id)).toEqual([6, 7]);
  expect(visible[1].items[0]).toMatchObject({ startTime: '13:00', endTime: '13:40', title: '5교시 · 수학' });
  expect(schoolGridDays(days, true)).toBe(days);
  expect(days[1].items[2].title).toBe('수학');
});

it('정규수업 펼치기는 유지하고 불필요한 안내·요일별 종료 요약은 제거한다', async () => {
  useTimetableView.setState({ schoolExpanded: false });
  const props = { theme: defaultTheme, days, today: 1, onSelectDay: jest.fn(), fitHeight: 600 };
  let tree!: ReactTestRenderer;
  try {
    await act(async () => { tree = create(<WeekTimeGrid {...props} />); });
    const text = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
    expect(text()).not.toContain('수업이 끝난 뒤');
    expect(text()).not.toContain('종료');
    expect(text()).not.toContain('점심');
    expect(text()).toContain('5교시\n수학');
    expect(text()).toContain('after_school 일정');
    const toggle = (label: string) => tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
    await act(async () => { toggle('정규수업 펼치기'); });
    expect(text()).toContain('점심');
    expect(text()).toContain('school 일정');
    await act(async () => { tree.unmount(); tree = create(<WeekTimeGrid {...props} focus />); });
    expect(useTimetableView.getState().schoolExpanded).toBe(true);
    await act(async () => { toggle('정규수업 접기'); });
    expect(text()).not.toContain('점심');
    expect(text()).toContain('5교시\n수학');
  } finally { await act(async () => tree?.unmount()); useTimetableView.setState({ schoolExpanded: false }); }
}, 30000);

it('학교가 없는 방학 학원 일정은 오전 일정도 숨기지 않는다', () => {
  const vacation = [{ day: 1, items: [item(1, 'academy', '09:00', '10:00')] }];
  expect(schoolGridDays(vacation, false)).toBe(vacation);
});

it('요일마다 점심 시간이 달라도 주간·요일별 결과가 같고 번호 있는 5교시는 시각을 바꾸지 않는다', () => {
  const mixed = [
    { day: 1, items: [item(10, 'life', '12:10', '13:00', '점심'), item(11, 'school', '13:00', '13:40')] },
    { day: 2, items: [item(12, 'life', '12:30', '13:40', '점심'), item(13, 'school', '13:00', '13:40', '수학', 5)] },
    { day: 3, items: [item(14, 'life', '12:10', '13:00', '점심'), item(15, 'academy', '09:00', '10:00')] },
  ];
  const week = schoolGridDays(mixed, false);
  mixed.forEach((day, index) => expect(week[index]).toEqual(schoolGridDays([day], false)[0]));
  expect(week[0].items[0].startTime).toBe('13:00');
  expect(week[1].items[0].startTime).toBe('13:00');
  expect(week[2].items).toBe(mixed[2].items);
});
