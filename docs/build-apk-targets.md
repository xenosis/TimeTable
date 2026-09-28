# APK 대상 구분

## 실기기 설치: 딸 폰·일반 Android 폰

SM-A245N처럼 ARM 기반 Android 폰에는 `arm64-v8a` APK만 설치한다.

```powershell
.\scripts\build-apk.ps1 -Target Device
```

생성 파일명에는 `Device-arm64-v8a`가 포함된다. 이 파일만 휴대폰으로 복사하거나 `adb install`에 사용한다.

## 실기기 오프라인 테스트 APK

개발 서버 없이 실제 앱 화면과 네이티브 기능을 확인할 때는 아래 명령을 사용한다.

```powershell
.\scripts\build-apk.ps1 -OfflineTest -Target Device
```

`TimeTable-v<버전>-OfflineTest-Device-arm64-v8a.apk`가 만들어진다. 이 파일은 JavaScript를 APK 안에 포함하므로 설치 후 PC, USB, Metro 개발 서버 없이 실행할 수 있다. 디버그 서명으로 만든 검증용 파일이며, 정식 배포용 릴리즈 APK가 아니다.

## 정식 릴리즈 APK

정식 업데이트용 APK는 새 서명 키를 만든 뒤에만 생성한다. 서명 키와 비밀번호는 앱 업데이트의 신원이며, 잃어버리면 기존 앱을 업데이트할 수 없다. 따라서 키 파일과 비밀번호를 각각 안전한 외부 보관 위치에 백업한 뒤 아래 형식으로 `android/release.properties`를 만든다. 이 파일과 키 파일은 Git에 올리지 않는다.

```properties
storeFile=release-keystore.jks
storePassword=키 저장소 비밀번호
keyAlias=kidtimetable
keyPassword=키 비밀번호
```

그 다음 실기기용 정식 릴리즈를 만든다.

```powershell
.\scripts\build-apk.ps1 -Release -Target Device
```

`Release`는 `release.properties`가 없으면 중단하며, 설정된 별도 키로만 서명한다. `OfflineTest`와 `Release`는 목적과 서명이 다른 파일이므로 이름이 비슷해도 바꾸어 사용하지 않는다.

## PC 에뮬레이터 검사

Windows Android 에뮬레이터에는 `x86_64` APK를 사용한다.

```powershell
.\scripts\build-apk.ps1 -Target Emulator
```

`npm run build`와 `npm run check`도 에뮬레이터용 x86_64 빌드를 수행한다. 이 결과물은 실기기 설치 파일이 아니다.

## PC 에뮬레이터 독립 실행 테스트

개발 서버가 필요 없는 PC 재현 테스트에는 아래 명령을 사용한다.

```powershell
.\scripts\build-apk.ps1 -OfflineTest -Target Emulator
```

`TimeTable-v<버전>-OfflineTest-Emulator-x86_64.apk`가 만들어진다. 이 파일은 에뮬레이터 전용이며, 이름에 `Emulator-x86_64`가 없는 APK는 PC 에뮬레이터 테스트에 사용하지 않는다.

## 설치 전 확인

APK의 `native-code`가 대상과 일치해야 한다.

```powershell
adb shell getprop ro.product.cpu.abilist
```

SM-A245N은 `arm64-v8a`를 지원한다.
