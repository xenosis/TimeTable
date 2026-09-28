const fs = require('fs');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(rawInput || '{}');
  } catch {
    console.error('BACKLOG_GUARD_ERROR: hook 입력을 파싱할 수 없습니다. 직접 읽기를 중단하고 hook 설정을 확인하세요.');
    process.exit(2);
  }

  const projectRoot = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const target = path.resolve(process.env.BACKLOG_GUARD_TARGET || path.join(projectRoot, 'backlog.json'));
  const cliPath = path.join(projectRoot, 'scripts', 'backlog', 'cli.cjs');
  const normalize = (value) => path.resolve(projectRoot, value || '.').replaceAll('/', path.sep).toLowerCase();
  const normalizedTarget = normalize(target);
  const isTarget = (value) => Boolean(value) && normalize(value) === normalizedTarget;
  let blocked = false;

  if (input.tool_name === 'Read') {
    blocked = isTarget(input.tool_input?.file_path);
  } else if (input.tool_name === 'Grep') {
    const searchPath = normalize(input.tool_input?.path || projectRoot);
    const targetInsideSearch = normalizedTarget === searchPath || normalizedTarget.startsWith(`${searchPath}${path.sep}`);
    const glob = String(input.tool_input?.glob || '');
    const explicitlyNonJson = glob && /\.(?:[cm]?[jt]sx?|md|txt|kt|java)(?:$|[},])/i.test(glob) && !/json/i.test(glob);
    blocked = targetInsideSearch && !explicitlyNonJson;
  } else if (input.tool_name === 'Bash') {
    const command = String(input.tool_input?.command || '').trim();
    const safeCli = !/[;&|<>]/.test(command) && (
      /^npm(?:\.cmd)?\s+run\s+backlog(?:\s+--)?(?:\s|$)/i.test(command)
      || /^node(?:\.exe)?\s+["']?(?:\.\/?|\.\\)?scripts[\\/]backlog[\\/]cli\.cjs["']?(?:\s|$)/i.test(command)
    );
    if (!safeCli) {
      const mentionsTarget = command.toLowerCase().includes(path.basename(target).toLowerCase())
        || command.replaceAll('/', path.sep).toLowerCase().includes(normalizedTarget);
      const reader = /(?:^|[;&|]\s*)(?:cat|type|get-content|gc|more|less|head|tail|sed|awk|select-string|rg|grep|findstr|copy-item|cp|node\s+-e|python(?:\.exe)?\s+-c)\b/i.test(command);
      blocked = mentionsTarget && reader;
    }
  }

  if (!blocked) process.exit(0);
  if (!fs.existsSync(cliPath)) {
    console.error(`BACKLOG_CLI_MISSING: ${cliPath}가 없습니다. 직접 읽기로 우회하지 말고 scripts/backlog/cli.cjs를 복구한 뒤 npm run backlog -- list --all을 실행하세요.`);
    process.exit(2);
  }
  console.error(`BACKLOG_DIRECT_READ_BLOCKED: 기준 백로그는 검증된 CLI로 조회하세요.
- 목록: npm run backlog -- list
- 전체 순회: npm run backlog -- list --all --json
- 상세: npm run backlog -- get P1.3 --json
- 진행 후보: npm run backlog -- next --json
add와 set-status도 같은 CLI 내부 읽기·쓰기는 허용됩니다. 이 hook은 Read/Grep 및 흔한 명시적 셸 읽기 패턴만 막으며 모든 우회 수단을 차단하는 보안 경계는 아닙니다.`);
  process.exit(2);
});
