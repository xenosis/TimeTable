// Node CLI의 CommonJS 입력 선택기를 직접 검증한다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { reviewContext } = require('../scripts/backlog/review-context.cjs');

test('리뷰 대상 이력을 보존하고 상위·의존·형제·하위 항목을 포함하되 무관한 작업은 제외한다', () => {
  const task = { id: 'P6.18', parent: 'P6', deps: ['P6.6'], log: ['a', 'b', 'c'] };
  const sibling = { id: 'P6.17', parent: 'P6', deps: ['P5'], log: ['a', 'b', 'c'] };
  const tasks = [task, sibling, { id: 'P6', deps: ['P5'] }, { id: 'P5', deps: [] },
    { id: 'P6.6', parent: 'P6', deps: [] }, { id: 'P6.18.1', parent: 'P6.18', deps: [] }, { id: 'P9', deps: [] }];
  const result = reviewContext(tasks, task);
  expect(result.map((item: { id: string }) => item.id)).toEqual(['P6.18', 'P6.17', 'P6', 'P5', 'P6.6', 'P6.18.1']);
  expect(result[0].log).toEqual(['a', 'b', 'c']);
  expect(result[1]).toMatchObject({ log: ['b', 'c'], omittedEarlierLogCount: 1 });
  expect(sibling.log).toEqual(['a', 'b', 'c']);
});

test('순환 의존은 종료하고 최상위 대상에서 무관한 최상위 항목을 형제로 취급하지 않는다', () => {
  const task = { id: 'P6', deps: ['P5'] };
  const tasks = [task, { id: 'P5', deps: ['P6'] }, { id: 'P7', deps: [] }];
  expect(reviewContext(tasks, task).map((item: { id: string }) => item.id)).toEqual(['P6', 'P5']);
});
