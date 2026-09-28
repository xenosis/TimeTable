// PreToolUse(Bash) 훅: npm install 감지 시 CLAUDE.md 라이브러리 정책(npx expo install)을 상기시킨다. 차단하지 않음.
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input || '{}');
  } catch (_e) {
    process.exit(0);
  }

  const command = (payload && payload.tool_input && payload.tool_input.command) || '';
  const isPlainInstall = /^\s*npm\s+(install|i)\s*$/.test(command);
  const isInstallWithArgs = /^\s*npm\s+(install|i)\b/.test(command) && !isPlainInstall;

  if (isInstallWithArgs) {
    console.log(JSON.stringify({
      systemMessage: '⚠️ npm install 감지 — Expo native 모듈이면 npx expo install 필요 (CLAUDE.md 라이브러리 정책)',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'CLAUDE.md 라이브러리 정책: Expo native 모듈은 반드시 npx expo install 사용(npm install 금지). 지금 설치하려는 패키지가 Expo SDK 관리 대상(예: expo-*, 네이티브 모듈)인지 확인하고, 맞다면 npx expo install로 다시 실행하세요. 순수 JS 패키지(zustand 등)라면 npm install 그대로 진행해도 됩니다.',
      },
    }));
  }
  process.exit(0);
});
