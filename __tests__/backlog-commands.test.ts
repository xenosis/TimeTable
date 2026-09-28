// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addTask, nextTasks, placeTask, setStatus, updateTask } = require('../scripts/backlog/commands.cjs');

const statuses = ['todo', 'in_progress', 'in_review', 'needs_info', 'blocked', 'done', 'cancelled'];

function task(id: string, status: string, parent: string | null = null, deps: string[] = []) {
  return {
    id, status, parent, deps, done_when: '검증 가능', owner: null, claimed_at: null,
    updated_at: '2026-09-15T00:00:00Z', log: [],
  };
}

test('next는 조상 작업의 미완료 의존성을 상속한다', () => {
  const data = {
    enums: { status: statuses },
    tasks: [task('P1', 'todo'), task('P2', 'todo', null, ['P1']), task('P2.1', 'todo', 'P2')],
  };

  expect(nextTasks(data, { all: true }).items.map((item: { id: string }) => item.id)).not.toContain('P2.1');
  data.tasks[0].status = 'done';
  expect(nextTasks(data, { all: true }).items.map((item: { id: string }) => item.id)).toEqual(['P2.1']);
});

test('cancelled 하위 작업은 부모 완료를 막지 않는다', () => {
  const parent = task('P8', 'in_review');
  const data = {
    meta: {},
    enums: { status: statuses },
    tasks: [parent, task('P8.1', 'cancelled', 'P8')],
  };

  setStatus(data, 'P8', 'done', { evidence: '선택 범위 종료', verification: '하위 상태 확인' }, '2026-09-15T01:00:00Z');
  expect(parent.status).toBe('done');
});

test('done 작업은 근거 있는 재검토를 위해 in_review로만 되돌릴 수 있다', () => {
  const completed = { ...task('P1.9', 'done'), done_at: '2026-09-16', evidence: '기존 근거' };
  const data = { meta: {}, enums: { status: statuses }, tasks: [completed] };

  setStatus(data, 'P1.9', 'in_review', { note: '완료 뒤 발견된 검증 결함 재검토' }, '2026-09-17T01:00:00Z');

  expect(completed.status).toBe('in_review');
  expect(completed.log.at(-1)).toMatchObject({ status: 'in_review', note: '완료 뒤 발견된 검증 결함 재검토' });
});

test('재검토 작업은 명시적으로 완료 메타데이터를 지운다', () => {
  const item = { ...task('P1.9', 'in_review'), done_at: '2026-09-16', evidence: '오래된 근거' };
  const data = { meta: {}, enums: { status: statuses }, tasks: [item] };

  updateTask(data, 'P1.9', { clear_completion: true, note: '재검토 중 이전 완료 근거 제거' }, '2026-09-17T01:00:00Z');

  expect(item).not.toHaveProperty('done_at');
  expect(item).not.toHaveProperty('evidence');
});

test('update는 지정한 필드만 바꾸고 상태와 이력을 보존한다', () => {
  const item = { ...task('P1.9', 'todo'), title: '기존 제목', summary: '기존 설명', priority: 'P1', category: 'feature', where: null, doc: null, est_min: 20, gate: null };
  const data = { meta: {}, enums: { status: statuses }, tasks: [item] };

  updateTask(data, 'P1.9', { summary: '새 설명', deps: '', note: '요구사항 반영' }, '2026-09-16T01:00:00Z');

  expect(item.title).toBe('기존 제목');
  expect(item.summary).toBe('새 설명');
  expect(item.deps).toEqual([]);
  expect(item.status).toBe('todo');
  expect(item.log.at(-1)).toMatchObject({ status: 'todo', note: '요구사항 반영' });
});

test('add는 parent의 마지막 하위 작업 바로 뒤에 삽입한다', () => {
  const data = {
    meta: { max_est_min: 30 },
    enums: { status: statuses, priority: ['P1', null], category: ['feature'] },
    tasks: [task('P1', 'todo'), task('P1.1', 'todo', 'P1'), task('P2', 'todo')],
  };
  addTask(data, { id: 'P1.2', title: '새 하위', category: 'feature', summary: '설명', done_when: '완료', parent: 'P1', est: '20' }, '2026-09-16T01:00:00Z');
  expect(data.tasks.map((item: { id: string }) => item.id)).toEqual(['P1', 'P1.1', 'P1.2', 'P2']);
});

test('place는 상태를 바꾸지 않고 표시 순서만 옮긴다', () => {
  const data = { meta: {}, enums: { status: statuses }, tasks: [task('P1', 'todo'), task('P2', 'in_review'), task('P3', 'todo')] };
  placeTask(data, 'P2', { after: 'P1', note: '부모 하위 표시 순서 정리' }, '2026-09-16T01:00:00Z');
  expect(data.tasks.map((item: { id: string }) => item.id)).toEqual(['P1', 'P2', 'P3']);
  expect(data.tasks[1].status).toBe('in_review');
});
