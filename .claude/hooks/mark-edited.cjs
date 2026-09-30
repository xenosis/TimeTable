const fs = require('fs');
const path = require('path');

// Write/Edit 도구를 쓸 때마다 "이 세션에서 파일을 수정함" 표시를 남긴다.
// Stop 훅(quality-stop.cjs)이 이 표시가 있을 때만 전체 검사를 실행한다.
let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(rawInput || '{}');
    const projectRoot = path.resolve(input.cwd || process.cwd());
    const sessionId = String(input.session_id || 'default').replace(/[^\w-]/g, '_');
    const flagDir = path.join(projectRoot, 'node_modules', '.cache', 'quality-edited');
    fs.mkdirSync(flagDir, { recursive: true });
    fs.writeFileSync(path.join(flagDir, sessionId), new Date().toISOString());
  } catch {
    // 표시 실패 시 Stop 훅이 검사를 건너뛸 수 있으므로 stderr로만 알리고 편집은 막지 않는다.
    console.error('mark-edited: 수정 표시를 남기지 못했습니다.');
  }
  process.exit(0);
});
