const { spawnSync } = require('child_process');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(rawInput || '{}');
  } catch {
    console.error('QUALITY_STOP_UNVERIFIED: Codex Stop hook 입력 JSON을 파싱할 수 없습니다. 완료 근거가 없습니다.');
    process.exit(2);
  }

  // The review dispatcher runs two short-lived Codex children in parallel.
  // Their outer/main workflow performs the mandatory full check after review
  // findings are reconciled; running it in each child causes concurrent Gradle
  // builds and can leave the dispatcher waiting on cache locks.
  if (process.env.BACKLOG_REVIEW_CHILD === '1') {
    console.error('QUALITY_STOP_DEFERRED: 백로그 검토 하위 프로세스의 전체 검사는 메인 작업이 검토 반영 후 수행합니다. 이것은 통과 또는 완료 근거가 아닙니다.');
    console.log('{}');
    process.exit(0);
  }

  const projectRoot = findProjectRoot(input.cwd || process.cwd());
  const result = spawnSync(process.execPath, ['scripts/run-quality-checks.cjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 690_000,
    windowsHide: true,
  });

  if (result.status === 0 && !result.error) {
    console.log('{}');
    process.exit(0);
  }

  const timedOut = result.error?.code === 'ETIMEDOUT';
  const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  const message = [
    timedOut
      ? 'QUALITY_STOP_TIMEOUT_UNVERIFIED: 전체 검사가 690초 안에 끝나지 않아 완료 근거로 사용할 수 없습니다.'
      : 'QUALITY_STOP_FAILED: 전체 품질 검사에 실패했습니다.',
    details,
    '필요한 다음 행동: 위 FAIL/NOT_CONFIGURED/TIMEOUT_UNVERIFIED 항목을 수정하고 해당 npm 명령을 다시 실행하세요.',
  ].filter(Boolean).join('\n');

  if (input.stop_hook_active) {
    console.log(JSON.stringify({
      continue: false,
      stopReason: 'Stop hook 재진입에서 품질 검사가 다시 실패했습니다.',
      systemMessage: `${message}\n무한 반복 방지를 위해 추가 continuation은 만들지 않지만 검증은 미통과이며 완료로 보고하면 안 됩니다.`,
    }));
    process.exit(0);
  }

  console.error(message);
  process.exit(2);
});

function findProjectRoot(startPath) {
  const fs = require('fs');
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, 'scripts', 'run-quality-checks.cjs'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startPath);
    current = parent;
  }
}
