const { assertAddId } = require('./validate.cjs');

const transitions = {
  todo: ['in_progress', 'needs_info', 'blocked', 'cancelled'],
  in_progress: ['in_review', 'needs_info', 'blocked', 'cancelled'],
  in_review: ['done', 'needs_info', 'blocked', 'cancelled'],
  needs_info: ['todo', 'in_progress'],
  blocked: ['todo', 'in_progress'],
  // A reviewed task may need a narrowly scoped correction when a later review
  // finds evidence that its completion condition was not actually met.
  done: ['in_review'],
  cancelled: [],
};

function parseNullable(value) {
  if (value === undefined) return undefined;
  return value === 'null' ? null : value;
}

function csv(value) {
  if (value === undefined || value === '') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function integerOption(value, name) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name}은 0 이상의 정수여야 합니다.`);
  return Number.parseInt(value, 10);
}

function page(items, options, defaultLimit) {
  const offset = integerOption(options.offset, '--offset') || 0;
  const explicitLimit = integerOption(options.limit, '--limit');
  const limit = explicitLimit ?? (options.all ? items.length : defaultLimit);
  const selected = items.slice(offset, offset + limit);
  return {
    total: items.length,
    offset,
    limit,
    returned: selected.length,
    nextOffset: offset + selected.length < items.length ? offset + selected.length : null,
    items: selected,
  };
}

function listTasks(data, options) {
  if (options.done && options.all) throw new Error('--done과 --all은 함께 사용할 수 없습니다.');
  if (options.status !== undefined && !data.enums.status.includes(options.status)) {
    throw new Error(`허용되지 않은 status 필터: ${options.status}`);
  }
  if (options.category !== undefined && !data.enums.category.includes(options.category)) {
    throw new Error(`허용되지 않은 category 필터: ${options.category}`);
  }
  const requestedPriority = parseNullable(options.priority);
  if (requestedPriority !== undefined && !data.enums.priority.includes(requestedPriority)) {
    throw new Error(`허용되지 않은 priority 필터: ${options.priority}`);
  }
  const requestedParent = parseNullable(options.parent);
  if (requestedParent !== undefined && requestedParent !== null && !data.tasks.some((task) => task.id === requestedParent)) {
    throw new Error(`존재하지 않는 parent 필터: ${requestedParent}`);
  }
  let tasks = [...data.tasks];
  if (options.done) tasks = tasks.filter((task) => task.status === 'done');
  else if (!options.all && options.status === undefined) {
    tasks = tasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  }
  for (const key of ['status', 'category']) {
    if (options[key] !== undefined) tasks = tasks.filter((task) => task[key] === options[key]);
  }
  for (const key of ['priority', 'parent', 'owner']) {
    const value = parseNullable(options[key]);
    if (value !== undefined) tasks = tasks.filter((task) => task[key] === value);
  }
  return page(tasks, options, 50);
}

function getTask(data, id) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) {
    const error = new Error(`작업 ID를 찾을 수 없습니다: ${JSON.stringify(id)}`);
    error.code = 'NOT_FOUND';
    throw error;
  }
  return task;
}

function nextTasks(data, options) {
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const parentIds = new Set(data.tasks.map((task) => task.parent).filter(Boolean));
  const inheritedDepsDone = (task) => {
    let current = task;
    while (current) {
      if (!current.deps.every((dep) => byId.get(dep)?.status === 'done')) return false;
      current = current.parent ? byId.get(current.parent) : null;
    }
    return true;
  };
  let tasks = data.tasks.filter((task) => task.status === 'todo'
    && !parentIds.has(task.id)
    && inheritedDepsDone(task));
  const owner = parseNullable(options.owner);
  if (owner !== undefined) tasks = tasks.filter((task) => task.owner === owner);
  return page(tasks, options, 10);
}

function requireOptions(options, names) {
  const missing = names.filter((name) => typeof options[name] !== 'string' || options[name].trim() === '');
  if (missing.length) throw new Error(`필수 옵션 누락: ${missing.map((name) => `--${name.replaceAll('_', '-')}`).join(', ')}`);
}

function isDescendantOf(task, ancestorId, byId) {
  let current = task;
  while (current?.parent) {
    if (current.parent === ancestorId) return true;
    current = byId.get(current.parent);
  }
  return false;
}

function insertByParentTree(tasks, task) {
  if (task.parent === null) {
    tasks.push(task);
    return;
  }
  const byId = new Map(tasks.map((item) => [item.id, item]));
  let insertionIndex = -1;
  tasks.forEach((item, index) => {
    if (item.id === task.parent || isDescendantOf(item, task.parent, byId)) insertionIndex = index;
  });
  if (insertionIndex === -1) throw new Error(`삽입할 parent 트리를 찾을 수 없습니다: ${task.parent}`);
  tasks.splice(insertionIndex + 1, 0, task);
}

function addTask(data, options, now) {
  requireOptions(options, ['id', 'title', 'category', 'summary', 'done_when']);
  assertAddId(options.id);
  if (data.tasks.some((task) => task.id === options.id)) throw new Error(`중복 작업 ID: ${options.id}`);
  if (!data.enums.category.includes(options.category)) throw new Error(`허용되지 않은 category: ${options.category}`);
  const priority = parseNullable(options.priority) ?? null;
  if (!data.enums.priority.includes(priority)) throw new Error(`허용되지 않은 priority: ${options.priority}`);
  const parent = parseNullable(options.parent) ?? null;
  const deps = csv(options.deps);
  if (deps.includes(options.id) || parent === options.id) throw new Error(`${options.id}: 자기 참조 순환은 허용되지 않습니다.`);
  const ids = new Set(data.tasks.map((task) => task.id));
  if (parent !== null && !ids.has(parent)) throw new Error(`존재하지 않는 parent: ${parent}`);
  for (const dep of deps) if (!ids.has(dep)) throw new Error(`존재하지 않는 dep: ${dep}`);
  const estMin = options.est === undefined ? null : integerOption(options.est, '--est');
  if (estMin !== null && estMin <= 0) throw new Error('--est는 양의 정수여야 합니다.');
  if (Number.isInteger(data.meta.max_est_min) && estMin !== null && estMin > data.meta.max_est_min) {
    throw new Error(`--est ${estMin}이 meta.max_est_min ${data.meta.max_est_min}을 초과합니다.`);
  }
  const owner = parseNullable(options.owner) ?? null;
  const task = {
    id: options.id,
    status: 'todo',
    priority,
    category: options.category,
    title: options.title,
    summary: options.summary,
    where: parseNullable(options.where) ?? null,
    parent,
    deps,
    doc: parseNullable(options.doc) ?? null,
    done_when: options.done_when,
    est_min: estMin,
    gate: parseNullable(options.gate) ?? null,
    owner,
    claimed_at: null,
    updated_at: now,
    log: [],
  };
  insertByParentTree(data.tasks, task);
  data.meta.updated = now.slice(0, 10);
  return data;
}

function placeTask(data, id, options, now) {
  requireOptions(options, ['after', 'note']);
  const sourceIndex = data.tasks.findIndex((task) => task.id === id);
  const afterIndex = data.tasks.findIndex((task) => task.id === options.after);
  if (sourceIndex === -1) return getTask(data, id);
  if (afterIndex === -1) throw new Error(`기준 작업 ID를 찾을 수 없습니다: ${options.after}`);
  if (id === options.after) throw new Error('작업을 자기 자신 뒤에 배치할 수 없습니다.');
  const [task] = data.tasks.splice(sourceIndex, 1);
  const targetIndex = data.tasks.findIndex((item) => item.id === options.after);
  data.tasks.splice(targetIndex + 1, 0, task);
  task.updated_at = now;
  task.log.push({ at: now, owner: task.owner ?? null, status: task.status, note: options.note });
  data.meta.updated = now.slice(0, 10);
  return data;
}

function updateTask(data, id, options, now) {
  const task = getTask(data, id);
  const fields = ['title', 'category', 'summary', 'done_when', 'priority', 'parent', 'deps', 'where', 'doc', 'est', 'gate'];
  const requested = fields.filter((field) => options[field] !== undefined);
  if (!requested.length && !options.clear_completion) throw new Error('update에는 바꿀 필드 또는 --clear-completion이 필요합니다.');
  if (!options.note?.trim()) throw new Error('update에는 변경 이유를 남길 --note가 필요합니다.');

  for (const field of requested) {
    if (field === 'deps') {
      task.deps = csv(options.deps);
    } else if (field === 'est') {
      task.est_min = options.est === 'null' ? null : integerOption(options.est, '--est');
    } else if (['priority', 'parent', 'where', 'doc', 'gate'].includes(field)) {
      task[field === 'priority' ? 'priority' : field] = parseNullable(options[field]);
    } else {
      task[field] = options[field];
    }
  }
  if (options.clear_completion) {
    if (task.status === 'done') throw new Error('--clear-completion은 done 상태가 아닌 재검토 작업에만 사용할 수 있습니다.');
    delete task.done_at;
    delete task.evidence;
  }
  task.updated_at = now;
  task.log.push({
    at: now,
    owner: task.owner ?? null,
    status: task.status,
    note: options.note,
  });
  data.meta.updated = now.slice(0, 10);
  return data;
}

function setStatus(data, id, targetStatus, options, now) {
  const task = getTask(data, id);
  if (!data.enums.status.includes(targetStatus)) throw new Error(`허용되지 않은 status: ${targetStatus}`);
  const allowed = transitions[task.status];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(`허용되지 않은 상태 전이: ${task.status} -> ${targetStatus}. 허용: ${(allowed || []).join(', ') || '없음'}`);
  }
  if (['needs_info', 'blocked'].includes(targetStatus) && !options.note) {
    throw new Error(`${targetStatus} 전이에는 --note가 필요합니다.`);
  }
  if (targetStatus === 'done') {
    requireOptions(options, ['evidence', 'verification']);
    if (!task.done_when?.trim()) throw new Error(`${id}: 완료 조건 done_when이 없어 done으로 변경할 수 없습니다.`);
    const byId = new Map(data.tasks.map((item) => [item.id, item]));
    const pendingDeps = task.deps.filter((dep) => byId.get(dep)?.status !== 'done');
    const pendingChildren = data.tasks
      .filter((item) => item.parent === id && !['done', 'cancelled'].includes(item.status))
      .map((item) => item.id);
    if (pendingDeps.length) throw new Error(`${id}: 완료되지 않은 deps: ${pendingDeps.join(', ')}`);
    if (pendingChildren.length) throw new Error(`${id}: 완료되지 않은 하위 작업: ${pendingChildren.join(', ')}`);
    task.done_at = now.slice(0, 10);
    task.evidence = `${options.evidence} · 검증: ${options.verification}`;
  }
  const previousStatus = task.status;
  task.status = targetStatus;
  task.updated_at = now;
  if (options.owner !== undefined) task.owner = parseNullable(options.owner);
  if (targetStatus === 'in_progress' && !task.claimed_at) task.claimed_at = now;
  const note = options.note || (targetStatus === 'done'
    ? `완료 근거: ${task.evidence}`
    : `상태 변경: ${previousStatus} -> ${targetStatus}`);
  task.log.push({ at: now, owner: task.owner ?? null, status: targetStatus, note });
  data.meta.updated = now.slice(0, 10);
  return data;
}

module.exports = { addTask, getTask, listTasks, nextTasks, placeTask, setStatus, transitions, updateTask };
