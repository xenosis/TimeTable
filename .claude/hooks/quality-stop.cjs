const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(rawInput || '{}');
  } catch {
    console.error('QUALITY_STOP_UNVERIFIED: Stop hook 입력 JSON을 파싱할 수 없습니다. 완료 근거가 없습니다.');
    process.exit(2);
  }

  const projectRoot = path.resolve(input.cwd || process.cwd());

  // 이 세션에서 Write/Edit로 파일을 수정한 표시(mark-edited.cjs)가 없으면 검사를 건너뛴다
  const sessionId = String(input.session_id || 'default').replace(/[^\w-]/g, '_');
  const flagPath = path.join(projectRoot, 'node_modules', '.cache', 'quality-edited', sessionId);
  if (!fs.existsSync(flagPath)) process.exit(0);

  const result = spawnSync(process.execPath, ['scripts/run-quality-checks.cjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 690_000,
    windowsHide: true,
  });

  if (result.status === 0 && !result.error) {
    // 통과하면 표시를 지운다. 실패 시에는 남겨 다음 Stop에서도 다시 검사한다.
    try { fs.unlinkSync(flagPath); } catch { /* 이미 없으면 무시 */ }
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
    console.error(`${message}\nStop hook 재진입이므로 무한 반복을 막기 위해 다시 차단하지 않습니다. 단, 검증은 미통과 상태이며 완료로 보고하면 안 됩니다.`);
    process.exit(1);
  }

  console.error(message);
  process.exit(2);
});
