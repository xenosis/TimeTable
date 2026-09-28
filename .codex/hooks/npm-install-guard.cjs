let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(rawInput || '{}');
  } catch {
    process.exit(0);
  }

  const command = String(input.tool_input?.command || input.tool_input?.cmd || '');
  const isInstallWithArgs = /^\s*npm(?:\.cmd)?\s+(?:install|i)\b\s+\S+/i.test(command);
  if (isInstallWithArgs) {
    console.log(JSON.stringify({
      systemMessage: 'npm install 감지: CLAUDE.md와 AGENTS.md의 공통 라이브러리 정책을 확인하세요.',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: '새 라이브러리는 사용자에게 먼저 확인해야 합니다. Expo SDK 관리 대상이나 네이티브 모듈이면 npm install 대신 npx expo install을 사용하세요. 순수 JS 패키지도 사용자 승인 후 설치합니다.',
      },
    }));
  }
  process.exit(0);
});
