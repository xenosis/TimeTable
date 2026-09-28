param(
  [switch]$Release,
  [switch]$OfflineTest,
  [ValidateSet('Device', 'Emulator')]
  [string]$Target = 'Device'
)

if ($Release -and $OfflineTest) { throw 'Release와 OfflineTest는 함께 지정할 수 없습니다.' }

$root = Split-Path $PSScriptRoot -Parent
$app = Get-Content "$root\app.json" -Raw | ConvertFrom-Json
$javaHome = if ($env:TIMETABLE_JAVA_HOME) { $env:TIMETABLE_JAVA_HOME } else { Join-Path ${env:ProgramFiles} 'Android\Android Studio\jbr' }
if (-not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) { throw "JDK 21을 찾을 수 없습니다: $javaHome" }
$usesReleaseVariant = $Release -or $OfflineTest
$variant = if ($usesReleaseVariant) { 'release' } else { 'debug' }
$task = if ($usesReleaseVariant) { 'assembleRelease' } else { 'assembleDebug' }
if ($Release -and $Target -eq 'Emulator') { throw '정식 릴리즈 APK는 실기기용 ARM64만 지원합니다.' }
$architecture = if ($Target -eq 'Device') { 'arm64-v8a' } else { 'x86_64' }

if ($Release -and -not (Test-Path "$root\android\release.properties")) {
  throw "릴리즈 서명 설정이 없습니다. android\release.properties를 만들고 storeFile, storePassword, keyAlias, keyPassword를 설정하세요."
}

Get-ChildItem "$root\android\app\src\main\java" -Recurse -Filter '*.kt' | ForEach-Object { $_.LastWriteTime = Get-Date }
Push-Location "$root\android"
try {
  $env:JAVA_HOME = $javaHome
  $gradleArgs = @($task, "-PreactNativeArchitectures=$architecture")
  if ($OfflineTest) { $gradleArgs += '-Ptimetable.allowDebugReleaseSigning=true' }
  .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally { Pop-Location }

$source = "$root\android\app\build\outputs\apk\$variant\app-$variant.apk"
$buildLabel = if ($OfflineTest) { 'OfflineTest' } else { $variant }
$outputPath = "$root\TimeTable-v$($app.expo.version)-$buildLabel-$Target-$architecture.apk"
Copy-Item $source $outputPath -Force
Write-Host "APK 생성 완료 ($buildLabel / $Target / $architecture): $outputPath" -ForegroundColor Green
