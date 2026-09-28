class BacklogValidationError extends Error {
  constructor(errors) {
    super(`백로그 검증 실패 (${errors.length}건):\n- ${errors.join('\n- ')}`);
    this.name = 'BacklogValidationError';
    this.errors = errors;
  }
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function findCycles(tasks, field) {
  const graph = new Map(tasks.map((task) => [task.id, field === 'deps'
    ? task.deps || []
    : task.parent ? [task.parent] : []]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id, trail) {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      cycles.push([...trail.slice(start), id].join(' -> '));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) || []) {
      if (graph.has(next)) visit(next, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of graph.keys()) visit(id, []);
  return [...new Set(cycles)];
}

function validateBacklog(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BacklogValidationError(['최상위 값은 객체여야 합니다.']);
  }
  if (typeof data.$schema_version !== 'string') errors.push('$schema_version 문자열이 필요합니다.');
  if (!data.meta || typeof data.meta !== 'object') errors.push('meta 객체가 필요합니다.');
  if (!data.enums || typeof data.enums !== 'object') errors.push('enums 객체가 필요합니다.');
  if (!Array.isArray(data.tasks)) errors.push('tasks 배열이 필요합니다.');
  if (errors.length) throw new BacklogValidationError(errors);

  const enumNames = ['status', 'priority', 'category'];
  for (const name of enumNames) {
    if (!Array.isArray(data.enums[name]) || data.enums[name].length === 0) {
      errors.push(`enums.${name}는 비어 있지 않은 배열이어야 합니다.`);
    }
  }
  if (errors.length) throw new BacklogValidationError(errors);

  const ids = new Set();
  data.tasks.forEach((task, index) => {
    const label = typeof task?.id === 'string' ? task.id : `tasks[${index}]`;
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      errors.push(`tasks[${index}]는 객체여야 합니다.`);
      return;
    }
    if (typeof task.id !== 'string' || task.id.trim() === '') errors.push(`${label}: id 문자열이 필요합니다.`);
    else if (ids.has(task.id)) errors.push(`${label}: 중복 id입니다.`);
    else ids.add(task.id);
    if (!data.enums.status.includes(task.status)) errors.push(`${label}: 허용되지 않은 status ${JSON.stringify(task.status)}`);
    if (!data.enums.priority.includes(task.priority)) errors.push(`${label}: 허용되지 않은 priority ${JSON.stringify(task.priority)}`);
    if (!data.enums.category.includes(task.category)) errors.push(`${label}: 허용되지 않은 category ${JSON.stringify(task.category)}`);
    if (typeof task.title !== 'string' || task.title.trim() === '') errors.push(`${label}: title 문자열이 필요합니다.`);
    if (typeof task.summary !== 'string' || task.summary.trim() === '') errors.push(`${label}: summary 문자열이 필요합니다.`);
    if (typeof task.done_when !== 'string' || task.done_when.trim() === '') errors.push(`${label}: done_when 문자열이 필요합니다.`);
    if (!Array.isArray(task.deps) || task.deps.some((dep) => typeof dep !== 'string')) errors.push(`${label}: deps는 문자열 배열이어야 합니다.`);
    if (!isNullableString(task.parent)) errors.push(`${label}: parent는 문자열 또는 null이어야 합니다.`);
    for (const key of ['where', 'doc', 'gate', 'owner', 'claimed_at']) {
      if (!isNullableString(task[key])) errors.push(`${label}: ${key}는 문자열 또는 null이어야 합니다.`);
    }
    if (task.est_min !== null && (!Number.isInteger(task.est_min) || task.est_min <= 0)) {
      errors.push(`${label}: est_min은 양의 정수 또는 null이어야 합니다.`);
    }
    if (!Array.isArray(task.log)) errors.push(`${label}: log 배열이 필요합니다.`);
    else task.log.forEach((entry, logIndex) => {
      if (!entry || typeof entry !== 'object') errors.push(`${label}.log[${logIndex}]: 객체여야 합니다.`);
      else {
        if (typeof entry.at !== 'string') errors.push(`${label}.log[${logIndex}]: at 문자열이 필요합니다.`);
        if (!data.enums.status.includes(entry.status)) errors.push(`${label}.log[${logIndex}]: status가 enum에 없습니다.`);
        if (!isNullableString(entry.owner)) errors.push(`${label}.log[${logIndex}]: owner는 문자열 또는 null이어야 합니다.`);
        if (typeof entry.note !== 'string' || entry.note.trim() === '') errors.push(`${label}.log[${logIndex}]: note 문자열이 필요합니다.`);
      }
    });
  });

  for (const task of data.tasks) {
    if (!task || typeof task.id !== 'string') continue;
    for (const dep of Array.isArray(task.deps) ? task.deps : []) {
      if (!ids.has(dep)) errors.push(`${task.id}: 존재하지 않는 deps 참조 ${JSON.stringify(dep)}`);
    }
    if (task.parent !== null && typeof task.parent === 'string' && !ids.has(task.parent)) {
      errors.push(`${task.id}: 존재하지 않는 parent 참조 ${JSON.stringify(task.parent)}`);
    }
  }
  for (const cycle of findCycles(data.tasks, 'deps')) errors.push(`deps 순환: ${cycle}`);
  for (const cycle of findCycles(data.tasks, 'parent')) errors.push(`parent 순환: ${cycle}`);

  if (Number.isInteger(data.meta.max_est_min)) {
    for (const task of data.tasks) {
      if (Number.isInteger(task.est_min) && task.est_min > data.meta.max_est_min) {
        errors.push(`${task.id}: est_min ${task.est_min}이 meta.max_est_min ${data.meta.max_est_min}을 초과합니다.`);
      }
    }
  }
  if (errors.length) throw new BacklogValidationError(errors);
  return data;
}

function assertAddId(id) {
  if (!/^P\d+(?:\.\d+)?$/.test(id)) {
    throw new BacklogValidationError([`${JSON.stringify(id)}는 기존 ID 형식 P숫자 또는 P숫자.숫자와 맞지 않습니다.`]);
  }
}

module.exports = { BacklogValidationError, assertAddId, validateBacklog };
