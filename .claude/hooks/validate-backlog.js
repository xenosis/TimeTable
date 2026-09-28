// PostToolUse(Write|Edit) 훅: backlog.json이 수정됐을 때만 스키마·참조 무결성을 검사한다.
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input || '{}');
  } catch (_e) {
    process.exit(0);
  }

  const filePath = (payload && payload.tool_input && payload.tool_input.file_path)
    || (payload && payload.tool_response && payload.tool_response.filePath)
    || '';
  if (!/backlog\.json$/.test(filePath)) {
    process.exit(0);
  }

  const fs = require('fs');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.log(JSON.stringify({
      systemMessage: `backlog 검증 스킵: 파일을 읽을 수 없음 (${e.message})`,
    }));
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `backlog.json JSON 파싱 실패: ${e.message}\n방금 수정한 내용을 되돌리거나 문법 오류를 수정하세요.`,
      systemMessage: '🚫 backlog.json이 유효한 JSON이 아닙니다.',
    }));
    process.exit(0);
  }

  const errors = [];
  if (!Array.isArray(data.tasks)) {
    errors.push('최상위 tasks 배열이 없습니다.');
  }
  const statusEnum = (data.enums && data.enums.status) || [];
  const priorityEnum = (data.enums && data.enums.priority) || [];
  const categoryEnum = (data.enums && data.enums.category) || [];

  const ids = new Set();
  const dupIds = [];
  (data.tasks || []).forEach((t) => {
    if (ids.has(t.id)) dupIds.push(t.id);
    ids.add(t.id);
  });
  if (dupIds.length) errors.push(`중복 id: ${dupIds.join(', ')}`);

  (data.tasks || []).forEach((t) => {
    if (!statusEnum.includes(t.status)) errors.push(`${t.id}: 잘못된 status "${t.status}"`);
    if (t.priority !== null && !priorityEnum.includes(t.priority)) errors.push(`${t.id}: 잘못된 priority "${t.priority}"`);
    if (!categoryEnum.includes(t.category)) errors.push(`${t.id}: 잘못된 category "${t.category}"`);
    (t.deps || []).forEach((dep) => {
      if (!ids.has(dep)) errors.push(`${t.id}: 존재하지 않는 deps 참조 "${dep}"`);
    });
    if (t.parent && !ids.has(t.parent)) errors.push(`${t.id}: 존재하지 않는 parent 참조 "${t.parent}"`);
  });

  if (errors.length) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `backlog.json 무결성 검사 실패 (${errors.length}건):\n- ${errors.join('\n- ')}\n수정 후 다시 저장하세요.`,
      systemMessage: `🚫 backlog.json 무결성 오류 ${errors.length}건`,
    }));
  } else {
    console.log(JSON.stringify({
      systemMessage: `✅ backlog.json 무결성 검사 통과 (${data.tasks.length}개 작업)`,
    }));
  }
  process.exit(0);
});
