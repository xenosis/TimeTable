# 빌드 · 업데이트 절차

이 문서는 PC에서 앱을 검사하고 APK를 만들어 딸 폰에 설치·업데이트하는 순서를 정리한다. APK 종류별 자세한 차이는 [`build-apk-targets.md`](build-apk-targets.md)를 본다.

## 준비물

- JDK 21: 기본값은 `C:\Program Files\Android\Android Studio\jbr`. 다른 곳에 있으면 환경 변수 `TIMETABLE_JAVA_HOME`에 경로를 넣는다.
- Android SDK: `C:\Users\Lenovo\AppData\Local\Android\Sdk` (API 34~36).
- Node.js와 `npm install`로 받은 의존성.
- 실기기 설치: USB 디버깅을 켠 폰과 `adb`(`platform-tools`).
- Expo Go로는 개발할 수 없다. 알람(네이티브)과 위젯 때문에 항상 개발 빌드나 릴리즈 계열 APK를 쓴다.

## 검사

| 명령 | 하는 일 |
| --- | --- |
| `npm run check` | 지침 동기화, 코드 길이, lint, 타입, Jest, Android 빌드(+ Kotlin JUnit)를 모두 실행한다. 작업 완료 전에 반드시 통과시킨다. 5~7분쯤 걸려 백그라운드로 돌리는 것을 권한다. |
| `npm run build` | 에뮬레이터용 x86_64 debug 빌드와 Kotlin JUnit(`:app:testDebugUnitTest`)만 실행한다. |
| `npm test` | Jest만 실행한다. |
| `npm run typecheck`, `npm run lint`, `npm run code-length` | 각각 타입, lint, 파일 길이(기본 300줄)만 본다. |

`npm run build`와 `npm run check`가 만드는 APK는 PC 에뮬레이터 검사용(x86_64)이다. **딸 폰에는 설치하지 않는다.**

## 버전 올리기

버그 수정이나 기능 변경을 하면 아래 세 파일을 **함께** 고친다.

- `app.json`: `expo.version`, `expo.android.versionCode`
- `package.json`: `version`
- `android/app/build.gradle`: `versionCode`(+1), `versionName`

`patch`(1.0.x)는 버그 수정, `minor`(1.x.0)는 새 기능, `major`(x.0.0)는 대규모 변경이다.

## APK 만들기 (딸 폰용)

딸 폰(SM-A245N)은 ARM이라 `arm64-v8a`만 설치한다. 파일 이름에 `Device-arm64-v8a`가 들어 있는지 설치 전에 확인한다.

| 목적 | 명령 | 결과 파일 |
| --- | --- | --- |
| 개발 서버 없이 실제 화면·알람·위젯 확인 | `.\scripts\build-apk.ps1 -OfflineTest -Target Device` | `TimeTable-v<버전>-OfflineTest-Device-arm64-v8a.apk` |
| 교체 중단 주입 같은 debug 전용 테스트 | `.\scripts\build-apk.ps1 -Target Device` | `TimeTable-v<버전>-debug-Device-arm64-v8a.apk` (실행에 Metro 개발 서버가 필요) |
| 정식 업데이트용 | `.\scripts\build-apk.ps1 -Release -Target Device` | `TimeTable-v<버전>-release-Device-arm64-v8a.apk` |

정식 릴리즈는 `android\release.properties`(키 저장소 경로·비밀번호·별칭)가 있어야 만들어지고, 없으면 중단된다. 키 저장소(`*.jks`)와 `release.properties`는 `.gitignore`로 제외돼 있다. **저장소가 공개(PUBLIC)이므로 키와 비밀번호는 절대 커밋하지 않는다.**

## 폰에 설치 · 업데이트

```powershell
adb devices                                  # 폰이 "device"로 보이는지 확인
adb -s <시리얼> install -r <APK 파일>         # 덮어 설치(업데이트)
```

- 같은 서명의 APK를 `install -r`로 덮어 설치하면 앱 데이터(시간표, 할 일, 보석)가 유지된다.
- **서명이 다르면** 덮어 설치가 안 된다. **`android/release.properties`가 있으면 OfflineTest도 release 키로 서명된다**(없을 때만 debug 키로 서명). 그래서 debug 빌드(개발용 앱)와는 서명이 달라 덮어 설치가 안 되고(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), 기존 앱을 지워야 하며(`adb uninstall com.sewoong.kidtimetable`) 이때 앱 데이터가 사라진다. 테스트 기기에 다른 기기의 데이터를 옮겨 넣어야 할 때는 `release.properties`를 잠깐 옆으로 옮겨 debug 키로 서명한 OfflineTest를 만든 뒤 쓰고, 끝나면 반드시 되돌린다.
- 앱을 지우고 새로 깔면 알림, 정확한 알람, 배터리 최적화 예외 권한이 초기화된다. 앱의 관리자 화면 "알림 준비" 카드에서 `허용하기`로 다시 켠다.
- 앱을 강제 종료하면 안드로이드가 앱의 알람 예약을 모두 지운다. 앱을 다시 열면 예약이 다시 만들어진다.
- 재부팅 뒤 알람 예약은 **처음 잠금을 푼 뒤에** 복구된다(백로그 P3.10 참고).

## PC 에뮬레이터

- `Medium_Phone_API_36.0`(Android 16 / API 36)을 쓴다. 느려지거나 앱이 응답 없음(ANR)으로 죽으면 `emulator -avd Medium_Phone_API_36.0 -no-snapshot-load`로 스냅샷 없이 다시 켠다.
- 에뮬레이터용 APK는 `.\scripts\build-apk.ps1 -Target Emulator`(개발 서버 필요) 또는 `-OfflineTest -Target Emulator`(개발 서버 불필요)로 만든다.

## 서명 키 백업

정식 릴리즈 서명 키를 잃어버리면 이미 설치된 앱을 같은 앱으로 업데이트할 수 없다. 키 저장소, 비밀번호, 별칭을 저장소 **밖**에 이중으로 보관해야 한다. 현재 키는 `android/release-keystore.jks`와 `android/release.properties`에 있고 `.gitignore`로 저장소에서 제외돼 있다(git 이력에도 올라간 적 없음을 확인). 저장소 밖 백업 위치는 아직 정하지 않았다(백로그 P7.6, 배포 직전에 사용자가 직접 백업한다). 정해지면 이 절에 위치를 기록하되 **비밀번호 자체는 이 문서나 저장소에 적지 않는다.**

## 자주 겪은 문제

| 증상 | 원인과 해결 |
| --- | --- |
| Gradle 증분 빌드에서 Kotlin 변경이 반영되지 않음 | Windows에서 내용·타임스탬프가 같으면 재컴파일되지 않는다. `build-apk.ps1`은 빌드 전에 `.kt` 타임스탬프를 갱신한다. |
| Metro가 번들을 만들지 못하고 멈춤 | 예전에 남은 Metro 프로세스가 8081 포트를 잡고 있는 경우가 많다. 종료한 뒤 `npx expo start --dev-client`를 다시 실행한다. |
| 위젯이 새 레이아웃으로 안 바뀜 | 앱을 덮어 설치하면 시스템이 위젯을 다시 그린다. 에뮬레이터가 느리면 1분쯤 걸린다. |
