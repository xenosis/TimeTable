# TimeTable

초등학교 2학년 딸을 위한 안드로이드 시간표 · 할 일 앱입니다.

## 핵심 기능

| # | 기능 | 내용 |
|---|------|------|
| F1 | 시간표 | 요일별 주간 시간표 보기 · 수정, 방학/평소 모드 전환 |
| F2 | 오늘의 할 일 | 숙제 등 매일/특정 날짜 할 일 체크 + 보석 보상 스티커판 |
| F3 | 시간 알림 | 항목별로 일반 알림 / 알람(전체화면 + 계속 울림) 선택 |
| F4 | 아빠 관리자 | 딸 폰에서 PIN 입력 후 시간표·할 일·보상 목표 수정 |
| F5 | 홈 화면 위젯 | 오늘 시간표를 홈 화면에서 바로 확인 |

## 사용 환경

- 딸: 실기기(갤럭시 A24, `SM-A245N`, Android 16)
- 아빠: 안드로이드폰 — 원격 수정은 이후 단계(Supabase 연동) 예정
- 배포: APK 직접 설치 (앱스토어 미사용)
- 패키지명: `com.sewoong.kidtimetable`
- 앱 표시 이름: TimeTable

## 기술 스택

- Framework: React Native (Expo SDK 57) / TypeScript, Expo Router(파일 기반 라우팅)
- DB: expo-sqlite (로컬). Supabase 연동은 이후 단계 예정
- 알림·알람: expo-notifications(일반) + 자체 Kotlin 네이티브 모듈(잠금화면 전체화면 알람, 포그라운드 서비스 소리)
- 위젯: Kotlin RemoteViews 기반 홈 화면 위젯 (`:widget` 별도 프로세스)
- 상태관리: React 훅 기반 (Zustand 도입 예정)
- 빌드: Gradle(Kotlin/Java 네이티브 모듈 포함), 로컬 빌드 스크립트로 개발/실기기용 APK 생성

## 현재 상태

기획 단계를 지나 실제 기능 개발이 진행 중입니다. 시간표·할 일·알림/알람·위젯의 핵심 기능이 구현되어 실기기에서 확인 중이며, 세부 진행 상황은 `backlog.json`(백로그 CLI)으로 관리합니다.

## 개발 시작하기

```bash
npm install
npm run start        # Expo 개발 서버 (Expo Go 사용 불가 — 아래 참고)
```

> **Expo Go로는 개발 불가**: 알람 모드(네이티브 모듈)와 위젯 때문에 항상 **개발 빌드**를 사용해야 합니다. `npm run android`(`expo run:android`)로 개발 빌드를 만들어 에뮬레이터/실기기에 설치하세요.

### 품질 검사

```bash
npm run check         # lint, typecheck, test, code-length, Android 빌드까지 한 번에 확인
npm run lint
npm run typecheck
npm run test
```

### 실기기용 APK 빌드

에뮬레이터(x86_64)용과 실기기(arm64-v8a)용 APK는 아키텍처가 다릅니다. **딸 폰 등 실기기에는 반드시** 아래 스크립트로 만든 `Device-arm64-v8a` APK만 설치하세요.

```powershell
# 실기기용 디버그 APK
./scripts/build-apk.ps1 -Target Device

# 실기기용 릴리즈 APK (android/release.properties 필요)
./scripts/build-apk.ps1 -Target Device -Release
```

자세한 내용은 [`docs/build-apk-targets.md`](docs/build-apk-targets.md) 참고.

## 백로그 운영

작업 진행 상황은 `backlog.json`을 전용 CLI로 조회·수정합니다. 직접 읽거나 편집하지 않습니다.

```bash
npm run backlog -- list --status in_progress --json   # 진행 중인 작업
npm run backlog -- next --json                        # 다음 착수 가능 작업
npm run backlog -- get <ID> --json                     # 특정 작업 상세
```

자세한 사용법은 [`docs/backlog-cli.md`](docs/backlog-cli.md), 검토 절차는 [`docs/backlog-review.md`](docs/backlog-review.md) 참고. 작업별 사람이 읽기 쉬운 설명은 `docs/backlog/`에 있습니다.

## 문서

| 문서 | 내용 |
|------|------|
| [`docs/research.md`](docs/research.md) | 조사 결과, 추천 설계, 위험 요소, 결정 사항 |
| [`docs/tasks.md`](docs/tasks.md) | 단계별 작업 목록 |
| [`docs/backlog-cli.md`](docs/backlog-cli.md) | 백로그 CLI 사용법 |
| [`docs/backlog-review.md`](docs/backlog-review.md) | 병렬 검토(critical-reviewer/backlog-explainer) 절차 |
| [`docs/build-apk-targets.md`](docs/build-apk-targets.md) | 에뮬레이터용 vs 실기기용 APK 빌드 구분 |
| [`docs/test-checklist.md`](docs/test-checklist.md) / [`docs/manual-device-tests.md`](docs/manual-device-tests.md) | 수동/실기기 테스트 체크리스트 |
| [`docs/needs-info-checklist.md`](docs/needs-info-checklist.md) | 실기기 확인이 필요한 항목 정리 |
| [`docs/widget-layout.md`](docs/widget-layout.md) | 홈 화면 위젯 레이아웃 제약사항 |
