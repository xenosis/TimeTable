const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const nodeCommand = process.execPath;

function npmInvocation(...args) {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `npm ${args.join(' ')}`],
    };
  }
  return { command: 'npm', args };
}

const checks = [
  {
    name: 'agent-instructions',
    command: nodeCommand,
    args: ['scripts/check-agent-instructions.cjs'],
    timeoutMs: 5_000,
    fix: 'CLAUDE.md와 AGENTS.md에 동일한 공통 운영 규칙을 반영한 뒤 npm run instructions:check를 다시 실행하세요.',
  },
  {
    name: 'code-length',
    command: nodeCommand,
    args: ['scripts/check-file-length.cjs'],
    timeoutMs: 10_000,
    fix: '표시된 파일에서 UI/상태/스타일 또는 도메인/IO 책임 경계를 찾아 분리하세요.',
  },
  {
    name: 'lint',
    ...npmInvocation('run', 'lint'),
    timeoutMs: 120_000,
    fix: 'ESLint가 표시한 파일과 규칙을 수정한 뒤 npm run lint를 다시 실행하세요.',
  },
  {
    name: 'typecheck',
    ...npmInvocation('run', 'typecheck'),
    timeoutMs: 60_000,
    fix: 'TypeScript 오류를 수정한 뒤 npm run typecheck를 다시 실행하세요.',
  },
  {
    name: 'test',
    ...npmInvocation('run', 'test:ci'),
    timeoutMs: 120_000,
    fix: '실패한 Jest 테스트 또는 구현을 수정한 뒤 npm run test:ci를 다시 실행하세요.',
  },
  {
    name: 'build',
    ...npmInvocation('run', 'build'),
    timeoutMs: 600_000,
    fix: 'Android Gradle 오류를 수정한 뒤 npm run build를 다시 실행하세요. APK 배포는 별도 작업입니다.',
  },
  {
    name: 'push-tests',
    ...npmInvocation('run', 'test:push'),
    timeoutMs: 30_000,
    fix: '변경 푸시 함수의 인증·가족 분리·전송 응답 검증 실패를 수정하세요.',
  },
];

let failed = false;
for (const check of checks) {
  console.log(`\n=== ${check.name} ===`);
  const result = spawnSync(check.command, check.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: check.timeoutMs,
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error && result.error.code === 'ETIMEDOUT') {
    failed = true;
    console.error(`${check.name}: TIMEOUT_UNVERIFIED (${check.timeoutMs / 1000}초). 완료 근거로 사용할 수 없습니다.`);
    console.error(`수정/다음 행동: ${check.fix}`);
  } else if (result.error && result.error.code === 'ENOENT') {
    failed = true;
    console.error(`${check.name}: NOT_CONFIGURED (${check.command} 실행 파일을 찾을 수 없음).`);
    console.error(`수정/다음 행동: ${check.fix}`);
  } else if (result.error) {
    failed = true;
    console.error(`${check.name}: EXEC_ERROR_UNVERIFIED (${result.error.message}).`);
    console.error(`수정/다음 행동: ${check.fix}`);
  } else if (result.status !== 0) {
    failed = true;
    console.error(`${check.name}: FAIL (exit ${result.status ?? 'unknown'}).`);
    console.error(`수정/다음 행동: ${check.fix}`);
  } else {
    console.log(`${check.name}: PASS`);
  }
}

if (failed) {
  console.error('\nQUALITY_CHECKS_FAILED: 실패 또는 미검증 항목이 남아 있습니다.');
  process.exit(1);
}
// 전체 검사를 통과했으면 지금 작업 트리의 수정은 검증된 것이다. Stop 훅이 같은 검사를 또 돌리지 않게 수정 표시를 지운다
for (const directory of ['quality-edited', 'codex-quality-edited']) {
  require('fs').rmSync(path.join(__dirname, '..', 'node_modules', '.cache', directory), { recursive: true, force: true });
}
console.log('\nQUALITY_CHECKS_OK: agent-instructions, code-length, lint, typecheck, test, build, push-tests 모두 통과했습니다.');
