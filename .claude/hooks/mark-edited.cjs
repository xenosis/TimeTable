const fs = require('fs');
const path = require('path');

// Write/Edit 도구로 관리 대상 소스코드를 고쳤을 때만 "이 세션에서 소스를 수정함" 표시를 남긴다.
// Stop 훅(quality-stop.cjs)이 이 표시가 있을 때만 전체 검사를 실행한다. 문서·백로그·임시(scratchpad) 파일만 쓴 대화는 검사하지 않는다.
// 관리 대상 판단은 .codex/hooks/post-edit-check.cjs의 isManagedSource와 같은 규칙에 앱 빌드·서버 함수 소스를 더했다.
function isManagedSource(projectRoot, filePath) {
  const relative = path.relative(projectRoot, path.resolve(projectRoot, filePath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const code = /\.(?:cjs|css|html|js|jsx|mjs|ts|tsx|java|kt)$/i.test(relative)
    && /^(?:app|src|__tests__|test-utils|scripts|dashboard|supabase[\\/]functions|\.claude[\\/]hooks|\.codex[\\/]hooks|android[\\/]app[\\/]src)(?:[\\/]|$)/i.test(relative);
  const buildConfig = /^(?:app\.json|package\.json|eas\.json|tsconfig\.json|babel\.config\.js|android[\\/]app[\\/]build\.gradle)$/i.test(relative);
  return code || buildConfig;
}

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(rawInput || '{}');
    const projectRoot = path.resolve(input.cwd || process.cwd());
    const filePath = input.tool_input?.file_path;
    if (typeof filePath !== 'string' || !isManagedSource(projectRoot, filePath)) process.exit(0);
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
