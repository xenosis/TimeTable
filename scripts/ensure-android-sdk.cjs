'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const candidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
].filter(Boolean);

const sdkPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!sdkPath) {
  console.error('ANDROID_SDK_NOT_FOUND: ANDROID_HOME 또는 Android SDK 경로를 설정한 뒤 다시 실행하세요.');
  process.exit(2);
}

const localPropertiesPath = path.join(projectRoot, 'android', 'local.properties');
const properties = `sdk.dir=${sdkPath.replace(/\\/g, '\\\\')}\n`;

if (fs.existsSync(localPropertiesPath) && fs.readFileSync(localPropertiesPath, 'utf8') === properties) {
  console.log('ANDROID_SDK_LOCAL_PROPERTIES_OK');
  process.exit(0);
}

fs.writeFileSync(localPropertiesPath, properties, 'utf8');
console.log('ANDROID_SDK_LOCAL_PROPERTIES_WRITTEN');
