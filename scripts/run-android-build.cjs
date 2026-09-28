'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const bundledJdk = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
const javaHome = process.env.TIMETABLE_JAVA_HOME || bundledJdk;
const javaExecutable = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const timeoutMs = 540_000;

if (!fs.existsSync(javaExecutable)) {
  console.error(`BUILD_JDK_NOT_CONFIGURED: JDK 21 실행 파일을 찾지 못했습니다: ${javaExecutable}`);
  console.error('수정 방법: Android Studio JBR을 설치하거나 TIMETABLE_JAVA_HOME에 JDK 21 경로를 지정하세요.');
  process.exit(2);
}

const ensureSdk = spawnSync(process.execPath, ['scripts/ensure-android-sdk.cjs'], {
  cwd: projectRoot,
  encoding: 'utf8',
  windowsHide: true,
});
if (ensureSdk.stdout) process.stdout.write(ensureSdk.stdout);
if (ensureSdk.stderr) process.stderr.write(ensureSdk.stderr);
if (ensureSdk.status !== 0 || ensureSdk.error) process.exit(ensureSdk.status || 2);

const environment = {
  ...process.env,
  JAVA_HOME: javaHome,
  NODE_ENV: 'development',
};
if (!environment.ANDROID_HOME && environment.LOCALAPPDATA) {
  environment.ANDROID_HOME = path.join(environment.LOCALAPPDATA, 'Android', 'Sdk');
}
if (!environment.ANDROID_SDK_ROOT) environment.ANDROID_SDK_ROOT = environment.ANDROID_HOME;

// 절대 경로를 써야 한다: Windows의 NoDefaultCurrentDirectoryInExePath 보안 설정이 켜져 있으면
// cmd.exe가 현재 디렉터리의 'gradlew.bat'을 명령으로 찾지 못한다.
const gradleCommand = process.platform === 'win32'
  ? { command: environment.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${path.join(androidRoot, 'gradlew.bat')}" :app:assembleDebug -PreactNativeArchitectures=x86_64`] }
  : { command: path.join(androidRoot, 'gradlew'), args: [':app:assembleDebug', '-PreactNativeArchitectures=x86_64'] };

console.log(`ANDROID_BUILD_JDK: ${javaHome}`);
console.log('ANDROID_BUILD_TARGET: Emulator (x86_64) — 품질 검사 전용이며 실기기 설치에 사용하지 마세요.');
const build = spawnSync(gradleCommand.command, gradleCommand.args, {
  cwd: androidRoot,
  encoding: 'utf8',
  env: environment,
  timeout: timeoutMs,
  windowsHide: true,
  // cmd.exe에 넘기는 큰따옴표 포함 인자를 Node가 다시 이스케이프하면 손상된다.
  windowsVerbatimArguments: process.platform === 'win32',
});
if (build.stdout) process.stdout.write(build.stdout);
if (build.stderr) process.stderr.write(build.stderr);

if (build.error?.code === 'ETIMEDOUT') {
  console.error(`ANDROID_BUILD_TIMEOUT_UNVERIFIED: ${timeoutMs / 1000}초 안에 완료되지 않았습니다.`);
  process.exit(2);
}
if (build.error) {
  console.error(`ANDROID_BUILD_EXEC_ERROR: ${build.error.message}`);
  process.exit(2);
}
process.exit(build.status ?? 1);
