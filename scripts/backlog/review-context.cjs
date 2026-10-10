'use strict';

/** 긴 전체 이력 대신 검토 대상과 관계된 항목을 같은 입력으로 전달한다. */
function reviewContext(tasks, task) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const selected = new Set();
  const visit = (id) => {
    if (selected.has(id)) return;
    const item = byId.get(id);
    if (!item) return;
    selected.add(id);
    if (item.parent) visit(item.parent);
    for (const dependency of item.deps ?? []) visit(dependency);
  };
  visit(task.id);
  // 형제 작업의 연계와 대상 자체의 하위 완료 조건도 확인한다.
  for (const item of tasks) {
    if (item.parent === task.id || (task.parent && item.parent === task.parent)) visit(item.id);
  }
  return tasks.filter((item) => selected.has(item.id)).map((item) => {
    if (item.id === task.id || (item.log?.length ?? 0) <= 2) return item;
    return { ...item, log: item.log.slice(-2), omittedEarlierLogCount: item.log.length - 2 };
  });
}

module.exports = { reviewContext };
