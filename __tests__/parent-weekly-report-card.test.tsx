import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { ParentWeeklyReportCard } from '../src/components/ParentWeeklyReportCard';
import { defaultTheme } from '../src/theme';

const mockLoad = jest.fn();
const mockSynced = jest.fn(() => true);
let mockSignal: () => void;
beforeEach(() => { mockSynced.mockReturnValue(true); });
jest.mock('../src/components/parentWeeklyReport', () => ({
  loadWeeklyReport: () => mockLoad(),
  weekSummaryLine: (report: { total: number }) => `할 일 ${report.total}개`,
  dayLabel: () => '', gemWeekLine: () => '',
}));
jest.mock('../src/sync/syncMarkers', () => ({ hasSyncedFamily: () => mockSynced() }));
jest.mock('../src/hooks/useNow', () => ({ useNow: () => new Date(2026, 9, 10, 12) }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ subscribeWidgetChecksApplied: (callback: () => void) => { mockSignal = callback; return () => undefined; } }));

const report = (total: number) => ({ total, done: 0, weekStart: '2026-10-05', days: [], gemWeeks: [] });
const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(Text).map((node) => String(node.props.children));

test('새 가족 동기화 전에는 조회하지 않고 완료 신호 뒤 집계를 표시한다', async () => {
  mockLoad.mockReset().mockResolvedValueOnce(report(7)).mockResolvedValueOnce(report(3));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-a" />); });
  mockSynced.mockReturnValue(false);
  await act(async () => { renderer.update(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-b" />); });
  expect(mockLoad).toHaveBeenCalledTimes(1);
  expect(texts(renderer)).toContain('서버와 맞춘 뒤에 보여요.');
  expect(texts(renderer)).not.toContain('할 일 7개');
  mockSynced.mockReturnValue(true);
  await act(async () => { mockSignal(); });
  expect(mockLoad).toHaveBeenCalledTimes(2);
  expect(texts(renderer)).toContain('할 일 3개');
  await act(async () => renderer.unmount());
});

test('가족을 바꾸면 이전 집계를 숨기고 새 가족 조회가 끝난 뒤 표시한다', async () => {
  mockLoad.mockReset().mockResolvedValueOnce(report(7));
  let finish!: (value: unknown) => void;
  mockLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-a" />); });
  expect(texts(renderer)).toContain('할 일 7개');
  await act(async () => { renderer.update(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-b" />); });
  expect(mockLoad).toHaveBeenCalledTimes(2);
  expect(texts(renderer)).not.toContain('할 일 7개');
  expect(texts(renderer)).toContain('불러오는 중이에요.');
  await act(async () => { finish(report(3)); });
  expect(texts(renderer)).toContain('할 일 3개');
  await act(async () => renderer.unmount());
});

test('이전 가족 조회가 늦게 끝나도 새 가족 집계를 덮지 않는다', async () => {
  let finish!: (value: unknown) => void;
  mockLoad.mockReset().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(report(3));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-a" />); });
  await act(async () => { renderer.update(<ParentWeeklyReportCard theme={defaultTheme} familyId="family-b" />); });
  await act(async () => { finish(report(7)); });
  expect(texts(renderer)).toContain('할 일 3개');
  expect(texts(renderer)).not.toContain('할 일 7개');
  await act(async () => renderer.unmount());
});
